export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

export type Service = {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  category: string;
};

export type Employee = {
  id: string;
  name: string;
  role: string;
  rating: number;
  avatar: string;
  services: string[];
};

export type PublicReview = {
  id: string;
  rating: number;
  comment: string;
  businessReply: string;
  createdAt: string;
};

export type PublicBusinessHour = {
  weekday: number;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
};

export type Business = {
  id: string;
  branchId?: string;
  slug: string;
  name: string;
  category: string;
  rating: number;
  reviews: number;
  distance: number | null;
  district: string;
  city: string;
  address: string;
  image: string;
  gallery: string[];
  logo?: string;
  open: boolean;
  nextAvailable: string;
  startingPrice: number;
  verified?: boolean;
  sponsored?: boolean;
  lat: number;
  lng: number;
  phone: string;
  website?: string;
  description: string;
  timezone?: string;
  todayHours?: PublicBusinessHour;
  hours?: PublicBusinessHour[];
  reviewItems?: PublicReview[];
  services: Service[];
  employees: Employee[];
};

export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export type Appointment = {
  id: string;
  businessId: string;
  businessName: string;
  businessImage: string;
  serviceId: string;
  serviceName: string;
  employeeId: string;
  employeeName: string;
  date: string;
  time: string;
  duration: number;
  price: number;
  status: AppointmentStatus;
  address: string;
};

export type CustomerAppointment = {
  id: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  businessImage: string;
  serviceId: string;
  serviceName: string;
  employeeId: string;
  employeeName: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  totalMinor: number;
  currency: string;
  status: AppointmentStatus;
  address: string;
  district: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  canCancel: boolean;
  canReschedule: boolean;
  cancellationNoticeMinutes: number;
  minimumNoticeMinutes: number;
  reviewId?: string;
  reviewRating?: number;
  reviewComment?: string;
  reviewStatus?: "pending" | "approved" | "rejected" | "flagged";
};
