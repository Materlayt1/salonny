import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/observability";

type Channel = "in_app" | "push" | "email" | "sms" | "whatsapp";
type Job = {
  id: string;
  channel: Channel;
  recipient: string;
  template_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

const endpointByChannel: Partial<Record<Channel, string | undefined>> = {
  email: process.env.EMAIL_PROVIDER_URL,
  sms: process.env.SMS_PROVIDER_URL,
  whatsapp: process.env.WHATSAPP_PROVIDER_URL,
  push: process.env.PUSH_PROVIDER_URL,
};

const tokenByChannel: Partial<Record<Channel, string | undefined>> = {
  email: process.env.EMAIL_PROVIDER_KEY,
  sms: process.env.SMS_PROVIDER_KEY,
  whatsapp: process.env.WHATSAPP_ACCESS_TOKEN,
  push: process.env.PUSH_PROVIDER_KEY,
};

async function deliver(job: Job) {
  if (job.channel === "in_app")
    return { provider: "internal", reference: job.id };
  const endpoint = endpointByChannel[job.channel];
  const token = tokenByChannel[job.channel];
  if (!endpoint || !token)
    throw new Error(`${job.channel} sağlayıcısı yapılandırılmadı.`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      idempotencyKey: job.id,
      to: job.recipient,
      template: job.template_key,
      variables: job.payload,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Sağlayıcı HTTP ${response.status} döndürdü.`);
  const result = (await response.json().catch(() => ({}))) as {
    id?: string;
    reference?: string;
  };
  return {
    provider: new URL(endpoint).hostname,
    reference: result.id ?? result.reference ?? job.id,
  };
}

export async function processCommunicationJobs(limit = 25) {
  const supabase = createAdminSupabaseClient();
  const workerId = crypto.randomUUID();
  const { data, error } = await supabase.rpc("claim_communication_jobs", {
    p_limit: Math.max(1, Math.min(limit, 100)),
    p_worker_id: workerId,
  });
  if (error) throw error;
  const jobs = (data ?? []) as Job[];
  let delivered = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const result = await deliver(job);
      const { error: completeError } = await supabase.rpc(
        "complete_communication_job",
        {
          p_job_id: job.id,
          p_provider: result.provider,
          p_reference: result.reference,
        },
      );
      if (completeError) throw completeError;
      delivered += 1;
    } catch (error) {
      failed += 1;
      await supabase.rpc("fail_communication_job", {
        p_job_id: job.id,
        p_error:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Bilinmeyen teslimat hatası",
      });
      await emitEvent("warn", {
        event: "communication_delivery_failed",
        jobId: job.id,
        channel: job.channel,
        error,
      });
    }
  }
  return { claimed: jobs.length, delivered, failed };
}
