export interface User {
  userId: string;
  name: string;
  email: string;
  profileImage?: string;
  createdAt: string;
  isDarkMode?: boolean;
  isGrayscale?: boolean;
}

export interface BPReading {
  userId: string;
  systolic: number;
  diastolic: number;
  pulse: number;
  battery: number;
  deviceStatus: string;
  status: string;
  timestamp: string;
}

export interface Alert {
  type: string;
  message: string;
  reading: BPReading;
}

export interface DoctorAccessLink {
  id?: string;
  token: string;
  patientUserId: string;
  doctorName?: string;
  doctorEmail?: string;
  createdAt: any;
  expiresAt: any;
  isActive: boolean;
  permissionLevel: 'view' | 'download' | 'emergency';
}

export interface AccessLog {
  id?: string;
  token: string;
  patientUserId: string;
  doctorEmail: string;
  doctorName?: string;
  accessTime: string;
  userAgent?: string;
}
