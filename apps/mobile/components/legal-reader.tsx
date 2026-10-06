import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react-native";
import { LoadingState, ErrorState, Screen } from "@/components/app-ui";
import { getLegalDocument, type LegalDocumentKey } from "@/lib/api";
import { theme } from "@/constants/theme";
export function LegalReader({ document, onClose }: { document: LegalDocumentKey | null; onClose: () => void }) {
  const content = useQuery({ queryKey: ["legal-document", document], queryFn: () => getLegalDocument(document!), enabled: Boolean(document), staleTime: 300_000 });
  return <Modal visible={Boolean(document)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><Screen>
    <View style={styles.header}><Text style={styles.heading}>{content.data?.title ?? "Bilgilendirme metni"}</Text><Pressable accessibilityRole="button" accessibilityLabel="Metni kapat" onPress={onClose}><X size={22} color={theme.colors.text} /></Pressable></View>
    <ScrollView contentContainerStyle={styles.body}>{content.isPending ? <LoadingState label="Metin yükleniyor..." /> : content.isError ? <ErrorState onRetry={() => void content.refetch()} /> : content.data ? <><Text style={styles.updated}>Son güncelleme: {content.data.updated}</Text>{content.data.sections.map((section) => <View key={section.title} style={styles.section}><Text style={styles.heading}>{section.title}</Text>{section.paragraphs?.map((paragraph) => <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>)}{section.bullets?.map((bullet) => <Text key={bullet} style={styles.paragraph}>• {bullet}</Text>)}</View>)}</> : null}</ScrollView>
  </Screen></Modal>;
}
const styles = StyleSheet.create({ header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 20, borderBottomColor: theme.colors.border, borderBottomWidth: 1 }, heading: { color: theme.colors.text, fontWeight: "700", fontSize: 18, flexShrink: 1 }, body: { padding: 24, paddingBottom: 48, gap: 28 }, section: { gap: 12 }, updated: { color: theme.colors.muted, fontSize: 11 }, paragraph: { color: theme.colors.muted, fontSize: 14, lineHeight: 25 } });
