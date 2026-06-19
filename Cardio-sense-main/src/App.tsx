import React, { Component, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, db, googleProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, collection, query, where, orderBy, onSnapshot, setDoc, getDoc, doc, Timestamp, getDocFromServer } from './firebase.ts';
import { User, BPReading, Alert } from './types.ts';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
import { io, Socket } from 'socket.io-client';
import { 
  Activity, 
  LayoutDashboard, 
  History, 
  FileText, 
  Settings, 
  LogOut, 
  Bell, 
  Battery, 
  Wifi, 
  WifiOff, 
  Download, 
  Play, 
  Pause, 
  Shield,
  User as UserIcon,
  Search,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Clock
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { 
  useReactTable, 
  getCoreRowModel, 
  flexRender, 
  createColumnHelper,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  SortingState
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'react-qr-code';
import { DoctorAccessLink, AccessLog } from './types.ts';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick, isDarkMode }: { icon: any, label: string, active?: boolean, onClick: () => void, isDarkMode?: boolean }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all duration-200",
      active 
        ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
        : isDarkMode 
          ? "text-slate-400 hover:bg-slate-800 hover:text-white"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
    )}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

const StatCard = ({ title, value, unit, status, icon: Icon, color, isDarkMode }: { title: string, value: number | string, unit: string, status?: string, icon: any, color: string, isDarkMode?: boolean }) => (
  <div className={cn(
    "p-6 rounded-2xl border transition-all duration-300",
    isDarkMode ? "bg-slate-900 border-slate-800 shadow-none hover:bg-slate-800" : "bg-white border-slate-100 shadow-sm hover:shadow-md"
  )}>
    <div className="flex justify-between items-start mb-4">
      <div className={cn("p-3 rounded-xl", color)}>
        <Icon size={24} className="text-white" />
      </div>
      {status && (
        <span className={cn(
          "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
          status === 'Normal' ? "bg-emerald-100 text-emerald-700" :
          status === 'High' ? "bg-rose-100 text-rose-700" :
          status === 'Low' ? "bg-amber-100 text-amber-700" :
          "bg-slate-100 text-slate-700"
        )}>
          {status}
        </span>
      )}
    </div>
    <h3 className={cn("text-sm font-medium mb-1", isDarkMode ? "text-slate-400" : "text-slate-500")}>{title}</h3>
    <div className="flex items-baseline gap-1">
      <span className={cn("text-3xl font-bold", isDarkMode ? "text-white" : "text-slate-900")}>{value}</span>
      <span className="text-slate-400 text-sm font-medium">{unit}</span>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [readings, setReadings] = useState<BPReading[]>([]);
  const [latestReading, setLatestReading] = useState<BPReading | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [isSimulatorRunning, setIsSimulatorRunning] = useState(false);
  const [isGrayscale, setIsGrayscale] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editProfileImage, setEditProfileImage] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [globalFilter, setGlobalFilter] = useState('');
  const [doctorViewId, setDoctorViewId] = useState<string | null>(null);
  const [doctorAccessToken, setDoctorAccessToken] = useState<string | null>(null);
  const [doctorAccessLink, setDoctorAccessLink] = useState<DoctorAccessLink | null>(null);
  const [doctorUserData, setDoctorUserData] = useState<User | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [accessLinks, setAccessLinks] = useState<DoctorAccessLink[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [showLinkGenModal, setShowLinkGenModal] = useState(false);
  const [genDuration, setGenDuration] = useState('24h');
  const [genPermission, setGenPermission] = useState<'view' | 'download' | 'emergency'>('view');
  const [genDoctorName, setGenDoctorName] = useState('');
  const [genDoctorEmail, setGenDoctorEmail] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const simulatorIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const DEFAULT_AVATARS = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Max',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie',
  ];

  // --- Auth ---
  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      console.error("Redirect login error:", err);
      if (err?.code !== 'auth/redirect-cancelled-by-user') {
        setError(err?.message || "Failed to sign in with Google redirect.");
      }
    });

    const params = new URLSearchParams(window.location.search);
    const token = params.get('access_token');
    if (token) {
      setDoctorAccessToken(token);
    }
  }, []);

  useEffect(() => {
    if (!doctorAccessToken || loading) return;
    
    const fetchDoctorData = async () => {
      setLoading(true);
      try {
        // 1. Fetch the access link (allowed without auth)
        const linkDoc = await getDoc(doc(db, 'doctorAccessLinks', doctorAccessToken));
        if (!linkDoc.exists()) {
          setError("Invalid access link.");
          setLoading(false);
          return;
        }

        const linkData = linkDoc.data() as DoctorAccessLink;
        
        // 2. Validate link
        const now = new Date();
        const expiry = linkData.expiresAt instanceof Timestamp ? linkData.expiresAt.toDate() : new Date(linkData.expiresAt);
        
        if (!linkData.isActive || expiry < now) {
          setError("This access link has expired or been revoked.");
          setLoading(false);
          return;
        }

        setDoctorAccessLink(linkData);
        setDoctorViewId(linkData.patientUserId);

        // 3. Log access (allowed without auth)
        const logId = uuidv4();
        const logData: any = {
          token: doctorAccessToken,
          patientUserId: linkData.patientUserId,
          doctorEmail: auth.currentUser?.email || 'anonymous@shared-access.local',
          doctorName: auth.currentUser?.displayName || 'Anonymous Doctor',
          accessTime: Timestamp.now(),
          userAgent: navigator.userAgent
        };
        await setDoc(doc(db, 'accessLogs', logId), logData);

        // 4. Check if authenticated to view patient profile
        if (!auth.currentUser) {
          // Keep doctorViewId set so we know we're in doctor mode,
          // but we'll show a sign-in prompt in the UI.
          setLoading(false);
          return;
        }

        // 5. Fetch patient profile
        const userDoc = await getDoc(doc(db, 'users', linkData.patientUserId));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setDoctorUserData({
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString())
          } as User);
        }
        
        // 5. Fetch readings for this user
        const q = query(
          collection(db, 'readings'),
          where('userId', '==', linkData.patientUserId),
          orderBy('timestamp', 'desc')
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(doc => ({
            ...doc.data(),
            timestamp: doc.data().timestamp instanceof Timestamp ? doc.data().timestamp.toDate().toISOString() : doc.data().timestamp
          })) as BPReading[];
          setReadings(data);
          if (data.length > 0) setLatestReading(data[0]);
          setLoading(false);
        }, (err) => {
          console.error("Doctor view data error:", err);
          setError("Failed to access physician view. Link may be invalid or expired.");
          setLoading(false);
        });
        
        return unsubscribe;
      } catch (err) {
        console.error("Doctor view initialization error:", err);
        setError("Failed to initialize physician view.");
        setLoading(false);
      }
    };
    
    fetchDoctorData();
  }, [doctorAccessToken, auth.currentUser]);

  useEffect(() => {
    if (user) {
      setEditName(user.name);
      setEditProfileImage(user.profileImage || '');
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userPath = `users/${firebaseUser.uid}`;
          let userDoc;
          try {
            userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, userPath);
          }

          if (userDoc?.exists()) {
            const data = userDoc.data();
            const userData = {
              ...data,
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString())
            } as User;
            setUser(userData);
            
            // Load theme preferences
            if (userData.isDarkMode !== undefined) setIsDarkMode(userData.isDarkMode);
            if (userData.isGrayscale !== undefined) setIsGrayscale(userData.isGrayscale);
          } else {
            const createdAt = Timestamp.now();
            const newUser = {
              userId: firebaseUser.uid,
              name: firebaseUser.displayName || 'User',
              email: firebaseUser.email || '',
              profileImage: firebaseUser.photoURL || '',
              createdAt: createdAt,
              isDarkMode: false,
              isGrayscale: false
            };
            try {
              await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, userPath);
            }
            setUser({
              ...newUser,
              createdAt: createdAt.toDate().toISOString()
            } as User);
          }
        } else {
          setUser(null);
        }
      } catch (err: any) {
        console.error("Auth initialization error:", err);
        try {
          const parsed = JSON.parse(err.message);
          setError(`Firestore Permission Denied: ${parsed.operationType} at ${parsed.path}`);
        } catch {
          setError(err.message || "Failed to initialize user session.");
        }
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      setError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Login failed:", err);
      if (err.code === 'auth/popup-blocked') {
        setError("Popup blocked. Redirecting to login...");
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectErr: any) {
          setError(redirectErr.message || "Failed to sign in with Google redirect.");
        }
      } else {
        setError(err.message || "Failed to sign in with Google. Please check your connection or popup settings.");
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsSimulatorRunning(false);
  };

  // --- Real-time Data ---

  useEffect(() => {
    if (!user) return;

    // Socket.IO setup
    socketRef.current = io(window.location.origin);
    socketRef.current.emit('join', user.userId);

    socketRef.current.on('bp_update', (reading: BPReading) => {
      if (isLive) {
        setLatestReading(reading);
        setReadings(prev => [reading, ...prev].slice(0, 1000));
      }
    });

    socketRef.current.on('alert', (alert: Alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 50));
    });

    // Firestore history setup
    const q = query(
      collection(db, 'readings'),
      where('userId', '==', user.userId),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : (data.timestamp || new Date().toISOString())
        } as BPReading;
      });
      // We only use this for initial load if readings is empty
      if (readings.length === 0) {
        setReadings(history.slice(0, 1000));
        setLatestReading(history[0] || null);
      }
    });

    return () => {
      socketRef.current?.disconnect();
      unsubscribe();
    };
  }, [user, isLive]);

  // --- Simulator ---

  const toggleSimulator = () => {
    if (isSimulatorRunning) {
      if (simulatorIntervalRef.current) clearInterval(simulatorIntervalRef.current);
      setIsSimulatorRunning(false);
    } else {
      setIsSimulatorRunning(true);
      simulatorIntervalRef.current = setInterval(async () => {
        if (!user) return;
        
        // Generate realistic BP values
        const systolic = Math.floor(Math.random() * (140 - 100) + 100);
        const diastolic = Math.floor(Math.random() * (95 - 65) + 65);
        const pulse = Math.floor(Math.random() * (100 - 60) + 60);
        const battery = Math.max(0, Math.min(100, (latestReading?.battery || 100) - (Math.random() > 0.9 ? 1 : 0)));

        const data = {
          userId: user.userId,
          systolic,
          diastolic,
          pulse,
          battery,
          deviceStatus: 'connected'
        };

        try {
          const res = await fetch('/api/device-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          const result = await res.json();
          
          // Also save to Firestore for persistence
          if (result.success) {
            const reading = result.reading;
            const readingPath = 'readings';
            try {
              await setDoc(doc(collection(db, readingPath)), {
                ...reading,
                timestamp: Timestamp.fromDate(new Date(reading.timestamp))
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, readingPath);
            }
          }
        } catch (error) {
          console.error("Simulator failed to send data:", error);
        }
      }, 1000);
    }
  };

  const safeFormat = useCallback((date: any, formatStr: string) => {
    if (!date) return '--';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '--';
      return format(d, formatStr);
    } catch (e) {
      return '--';
    }
  }, []);

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const saveSettings = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const userPath = `users/${user.userId}`;
      await setDoc(doc(db, 'users', user.userId), {
        isDarkMode,
        isGrayscale,
        name: editName,
        profileImage: editProfileImage
      }, { merge: true });
      
      setUser(prev => prev ? { ...prev, isDarkMode, isGrayscale, name: editName, profileImage: editProfileImage } : null);
      setSaveMessage("Settings saved successfully!");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaveMessage("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditProfileImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generatePhysicianLink = async () => {
    if (!user) return;
    
    const token = uuidv4();
    const now = new Date();
    let expiresAt = new Date();
    
    switch (genDuration) {
      case '1h': expiresAt.setHours(now.getHours() + 1); break;
      case '24h': expiresAt.setHours(now.getHours() + 24); break;
      case '7d': expiresAt.setDate(now.getDate() + 7); break;
      default: expiresAt.setHours(now.getHours() + 24);
    }

    const newLinkData: any = {
      token,
      patientUserId: user.userId,
      createdAt: Timestamp.fromDate(now),
      expiresAt: Timestamp.fromDate(expiresAt),
      isActive: true,
      permissionLevel: genPermission
    };

    if (genDoctorName) newLinkData.doctorName = genDoctorName;
    if (genDoctorEmail) newLinkData.doctorEmail = genDoctorEmail;

    try {
      await setDoc(doc(db, 'doctorAccessLinks', token), newLinkData);
      
      const baseUrl = window.location.origin + window.location.pathname;
      const link = `${baseUrl}?access_token=${token}`;
      setGeneratedLink(link);
      setShowLinkGenModal(false);
      setSaveMessage("Secure link generated!");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error("Failed to generate link:", err);
      setSaveMessage("Failed to generate link.");
    }
  };

  const revokeLink = async (tokenId: string) => {
    try {
      await setDoc(doc(db, 'doctorAccessLinks', tokenId), { isActive: false }, { merge: true });
      setSaveMessage("Access revoked successfully.");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error("Failed to revoke link:", err);
    }
  };

  // Fetch patient's own links and logs
  useEffect(() => {
    if (!user || doctorAccessToken) return;

    const linksQ = query(
      collection(db, 'doctorAccessLinks'),
      where('patientUserId', '==', user.userId),
      orderBy('createdAt', 'desc')
    );

    const logsQ = query(
      collection(db, 'accessLogs'),
      where('patientUserId', '==', user.userId),
      orderBy('accessTime', 'desc')
    );

    const unsubLinks = onSnapshot(linksQ, (snapshot) => {
      setAccessLinks(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt instanceof Timestamp ? doc.data().createdAt.toDate().toISOString() : doc.data().createdAt,
        expiresAt: doc.data().expiresAt instanceof Timestamp ? doc.data().expiresAt.toDate().toISOString() : doc.data().expiresAt
      })) as DoctorAccessLink[]);
    });

    const unsubLogs = onSnapshot(logsQ, (snapshot) => {
      setAccessLogs(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        accessTime: doc.data().accessTime instanceof Timestamp ? doc.data().accessTime.toDate().toISOString() : doc.data().accessTime
      })) as AccessLog[]);
    });

    return () => {
      unsubLinks();
      unsubLogs();
    };
  }, [user, doctorAccessToken]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSaveMessage("Link copied to clipboard!");
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const riskLevel = useMemo(() => {
    if (readings.length === 0) return 'LOW';
    const recent = readings.slice(0, 5);
    const highCount = recent.filter(r => r.status === 'High').length;
    if (highCount >= 3) return 'HIGH';
    if (highCount >= 1) return 'MODERATE';
    return 'LOW';
  }, [readings]);

  const intelligentInsights = useMemo(() => {
    if (readings.length < 2) return ["Starting data collection...", "Keep monitoring your vitals."];
    const insights = [];
    const latest = readings[0];
    const prev = readings[1];

    if (latest.systolic > prev.systolic + 20) {
      insights.push("Sudden systolic spike detected.");
    }
    if (latest.status === 'High' && prev.status === 'High') {
      insights.push("BP has been elevated for consecutive readings.");
    }
    if (latest.pulse > 100) {
      insights.push("Tachycardia (high pulse) detected.");
    }
    if (insights.length === 0) {
      insights.push("Your vitals are currently stable.");
      insights.push("Continue your regular monitoring schedule.");
    }
    return insights;
  }, [readings]);

  // --- Export ---

  const exportToExcel = () => {
    const data = readings.map(r => ({
      Timestamp: safeFormat(r.timestamp, 'yyyy-MM-dd HH:mm:ss'),
      Systolic: r.systolic,
      Diastolic: r.diastolic,
      Pulse: r.pulse,
      Status: r.status,
      Battery: `${r.battery}%`,
      Device: r.deviceStatus
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BP Readings");
    XLSX.writeFile(wb, `CardioSense_Report_${safeFormat(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Cardio Sense - Health Report", 20, 20);
    doc.setFontSize(12);
    doc.text(`User: ${user?.name}`, 20, 30);
    doc.text(`Email: ${user?.email}`, 20, 37);
    doc.text(`Report Date: ${safeFormat(new Date(), 'PPP p')}`, 20, 44);
    
    doc.text("Latest Readings (Last 20)", 20, 60);
    let y = 70;
    readings.slice(0, 20).forEach((r, i) => {
      doc.text(`${safeFormat(r.timestamp, 'HH:mm:ss')} | ${r.systolic}/${r.diastolic} mmHg | ${r.pulse} bpm | ${r.status}`, 20, y);
      y += 8;
    });
    
    doc.save(`CardioSense_Report_${safeFormat(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };

  // --- Table Setup ---

  const columnHelper = createColumnHelper<BPReading>();
  const columns = [
    columnHelper.accessor('timestamp', {
      header: 'Time',
      cell: info => safeFormat(info.getValue(), 'HH:mm:ss'),
    }),
    columnHelper.accessor('systolic', {
      header: 'Sys',
      cell: info => <span className="font-bold">{info.getValue()}</span>,
    }),
    columnHelper.accessor('diastolic', {
      header: 'Dia',
      cell: info => <span className="font-bold">{info.getValue()}</span>,
    }),
    columnHelper.accessor('pulse', {
      header: 'Pulse',
      cell: info => info.getValue(),
    }),
    columnHelper.display({
      id: 'bp',
      header: 'BP (mmHg)',
      cell: props => `${props.row.original.systolic}/${props.row.original.diastolic}`,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: info => (
        <span className={cn(
          "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
          info.getValue() === 'Normal' ? "bg-emerald-100 text-emerald-700" :
          info.getValue() === 'High' ? "bg-rose-100 text-rose-700" :
          info.getValue() === 'Low' ? "bg-amber-100 text-amber-700" :
          "bg-slate-100 text-slate-700"
        )}>
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('battery', {
      header: 'Battery',
      cell: info => (
        <div className="flex items-center gap-1">
          <Battery size={14} className={info.getValue() < 20 ? "text-rose-500" : "text-slate-400"} />
          <span>{info.getValue()}%</span>
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data: readings,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // --- Render ---

  if (doctorViewId) {
    if (!auth.currentUser || !doctorUserData) {
      return (
        <div className={cn(
          "h-screen w-full flex items-center justify-center p-6 transition-all duration-500",
          isGrayscale && "grayscale",
          isDarkMode ? "bg-slate-950" : "bg-slate-50"
        )}>
          <div className={cn(
            "max-w-md w-full p-8 rounded-3xl shadow-xl border text-center transition-colors duration-500",
            isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
          )}>
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
              <Activity className="text-white" size={32} />
            </div>
            <h1 className={cn("text-2xl font-bold mb-2", isDarkMode ? "text-white" : "text-slate-900")}>Physician Portal</h1>
            <p className={cn("mb-8", isDarkMode ? "text-slate-400" : "text-slate-500")}>
              {!auth.currentUser 
                ? "Please sign in to view this patient's secure health data." 
                : "Loading clinical data..."}
            </p>
            {!auth.currentUser && (
              <button
                onClick={handleLogin}
                className={cn(
                  "w-full flex items-center justify-center gap-3 border font-semibold py-3 px-4 rounded-xl transition-all active:scale-[0.98]",
                  isDarkMode ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-700" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                )}
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={cn(
        "h-screen w-full flex flex-col overflow-hidden font-sans transition-all duration-500",
        isGrayscale && "grayscale",
        isDarkMode ? "bg-slate-950 text-slate-100" : "bg-[#F8FAFC] text-slate-900"
      )}>
        {/* ICU Header */}
        <header className={cn(
          "h-20 border-b px-8 flex items-center justify-between shrink-0 transition-colors duration-500 z-10",
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
        )}>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-600 rounded-lg shadow-lg shadow-rose-900/20 animate-pulse">
                <Activity size={24} className="text-white" />
              </div>
              <div>
                <h2 className={cn("text-xl font-bold tracking-tight", isDarkMode ? "text-white" : "text-slate-900")}>Clinical Dashboard</h2>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Live Monitoring Active</p>
                </div>
              </div>
            </div>
            <div className={cn("h-8 w-[1px]", isDarkMode ? "bg-slate-800" : "bg-slate-200")}></div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
                {doctorUserData.profileImage ? <img src={doctorUserData.profileImage} alt={doctorUserData.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <UserIcon size={20} className="text-blue-600" />}
              </div>
              <div>
                <p className={cn("text-sm font-bold leading-tight", isDarkMode ? "text-white" : "text-slate-900")}>{doctorUserData.name}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Patient ID: {doctorViewId.slice(0, 8)}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-800/50 border border-slate-700">
              <div className={cn(
                "w-3 h-3 rounded-full",
                riskLevel === 'HIGH' ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" :
                riskLevel === 'MODERATE' ? "bg-amber-500" : "bg-emerald-500"
              )}></div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Risk: {riskLevel}</span>
            </div>
            
            <button 
              onClick={() => window.location.href = window.location.origin + window.location.pathname}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-900/20"
            >
              <LogOut size={16} />
              Exit Portal
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col lg:flex-row p-6 gap-6">
          {/* Left Column: Real-time Vitals & Alerts */}
          <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
            {/* Alert Banner */}
            {latestReading?.status === 'High' && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-rose-600 text-white p-4 rounded-2xl flex items-center justify-between shadow-xl shadow-rose-900/20"
              >
                <div className="flex items-center gap-3">
                  <AlertCircle size={24} className="animate-bounce" />
                  <div>
                    <p className="font-bold text-sm uppercase tracking-wider">Critical Alert</p>
                    <p className="text-xs text-rose-100">Patient BP exceeded safe limit: {latestReading.systolic}/{latestReading.diastolic} mmHg</p>
                  </div>
                </div>
                <div className="text-[10px] font-bold bg-rose-700 px-3 py-1 rounded-full uppercase tracking-widest">
                  Real-time
                </div>
              </motion.div>
            )}

            {/* Vitals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={cn(
                "p-6 rounded-3xl border transition-all relative overflow-hidden group",
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              )}>
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TrendingUp size={64} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Systolic Pressure</p>
                <div className="flex items-baseline gap-2">
                  <h3 className={cn(
                    "text-5xl font-bold tracking-tighter",
                    latestReading?.systolic && latestReading.systolic > 140 ? "text-rose-500" : isDarkMode ? "text-white" : "text-slate-900"
                  )}>
                    {latestReading?.systolic || '--'}
                  </h3>
                  <span className="text-slate-400 text-sm font-medium">mmHg</span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className={cn(
                    "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase",
                    latestReading?.status === 'High' ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
                  )}>
                    {latestReading?.status || 'Stable'}
                  </div>
                </div>
              </div>

              <div className={cn(
                "p-6 rounded-3xl border transition-all relative overflow-hidden group",
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              )}>
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TrendingDown size={64} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Diastolic Pressure</p>
                <div className="flex items-baseline gap-2">
                  <h3 className={cn(
                    "text-5xl font-bold tracking-tighter",
                    latestReading?.diastolic && latestReading.diastolic > 90 ? "text-rose-500" : isDarkMode ? "text-white" : "text-slate-900"
                  )}>
                    {latestReading?.diastolic || '--'}
                  </h3>
                  <span className="text-slate-400 text-sm font-medium">mmHg</span>
                </div>
              </div>

              <div className={cn(
                "p-6 rounded-3xl border transition-all relative overflow-hidden group",
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              )}>
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Activity size={64} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Heart Rate (Pulse)</p>
                <div className="flex items-baseline gap-2">
                  <h3 className={cn(
                    "text-5xl font-bold tracking-tighter",
                    latestReading?.pulse && (latestReading.pulse > 100 || latestReading.pulse < 60) ? "text-rose-500" : isDarkMode ? "text-white" : "text-slate-900"
                  )}>
                    {latestReading?.pulse || '--'}
                  </h3>
                  <span className="text-slate-400 text-sm font-medium">BPM</span>
                </div>
              </div>
            </div>

            {/* ICU Trend Graph */}
            <div className={cn(
              "p-8 rounded-3xl border shadow-sm flex-1 min-h-[400px] flex flex-col",
              isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
            )}>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className={cn("text-lg font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Live Vitals Trend</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Last 100 Data Points</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Systolic</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Diastolic</span>
                  </div>
                </div>
              </div>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[...readings].reverse().slice(-100)}>
                    <defs>
                      <linearGradient id="colorSys" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorDia" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#1E293B" : "#F1F5F9"} />
                    <XAxis dataKey="timestamp" hide />
                    <YAxis domain={[40, 180]} hide />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF',
                        color: isDarkMode ? '#F8FAFC' : '#0F172A'
                      }}
                    />
                    <Area type="monotone" dataKey="systolic" stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#colorSys)" />
                    <Area type="monotone" dataKey="diastolic" stroke="#6366F1" strokeWidth={3} fillOpacity={1} fill="url(#colorDia)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Right Column: Insights & History */}
          <div className="w-full lg:w-96 flex flex-col gap-6">
            {/* Intelligent Insights */}
            <div className={cn(
              "p-6 rounded-3xl border shadow-sm",
              isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
            )}>
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-blue-600/10 rounded-lg">
                  <Bell size={18} className="text-blue-600" />
                </div>
                <h3 className={cn("text-sm font-bold uppercase tracking-widest", isDarkMode ? "text-white" : "text-slate-900")}>Clinical Insights</h3>
              </div>
              <div className="space-y-4">
                {intelligentInsights.map((insight, i) => (
                  <div key={i} className={cn(
                    "p-4 rounded-2xl border flex gap-3",
                    isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-100"
                  )}>
                    <div className="mt-1 shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">{insight}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Logs Table */}
            <div className={cn(
              "p-6 rounded-3xl border shadow-sm flex-1 flex flex-col overflow-hidden",
              isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
            )}>
              <div className="flex items-center justify-between mb-6">
                <h3 className={cn("text-sm font-bold uppercase tracking-widest", isDarkMode ? "text-white" : "text-slate-900")}>Recent Records</h3>
                <Clock size={16} className="text-slate-400" />
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                {readings.slice(0, 20).map((r, i) => (
                  <div key={i} className={cn(
                    "p-4 rounded-2xl border flex items-center justify-between transition-all hover:scale-[1.02]",
                    isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-100"
                  )}>
                    <div>
                      <p className={cn("text-sm font-bold", isDarkMode ? "text-white" : "text-slate-900")}>{r.systolic}/{r.diastolic}</p>
                      <p className="text-[10px] text-slate-400">{safeFormat(r.timestamp, 'HH:mm:ss')}</p>
                    </div>
                    <div className={cn(
                      "px-2 py-0.5 rounded-md text-[8px] font-bold uppercase",
                      r.status === 'Normal' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                    )}>
                      {r.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium animate-pulse">Initializing Cardio Sense...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-100 text-center">
          <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="text-rose-600" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Initialization Error</h1>
          <p className="text-slate-500 mb-8">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={cn(
        "h-screen w-full flex items-center justify-center p-6 transition-all duration-500",
        isGrayscale && "grayscale",
        isDarkMode ? "bg-slate-950" : "bg-slate-50"
      )}>
        <div className={cn(
          "max-w-md w-full p-8 rounded-3xl shadow-xl border text-center transition-colors duration-500",
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
        )}>
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <Activity className="text-white" size={32} />
          </div>
          <h1 className={cn("text-2xl font-bold mb-2", isDarkMode ? "text-white" : "text-slate-900")}>Cardio Sense</h1>
          <p className={cn("mb-8", isDarkMode ? "text-slate-400" : "text-slate-500")}>Intelligent Blood Pressure Tracking System. Secure, real-time health monitoring.</p>
          <button
            onClick={handleLogin}
            className={cn(
              "w-full flex items-center justify-center gap-3 border font-semibold py-3 px-4 rounded-xl transition-all active:scale-[0.98]",
              isDarkMode ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-700" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            )}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "h-screen w-full flex overflow-hidden font-sans transition-all duration-500",
      isGrayscale && "grayscale",
      isDarkMode ? "bg-slate-950 text-slate-100" : "bg-[#F8FAFC] text-slate-900"
    )}>
      {/* Sidebar */}
      <aside className={cn(
        "w-72 border-r flex flex-col shrink-0 transition-colors duration-500",
        isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      )}>
        <div className="p-6 flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-md shadow-blue-100">
            <Activity size={24} className="text-white" />
          </div>
          <span className={cn("text-xl font-bold tracking-tight", isDarkMode ? "text-white" : "text-slate-900")}>Cardio Sense</span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} isDarkMode={isDarkMode} />
          <SidebarItem icon={Activity} label="Live Monitoring" active={activeTab === 'live'} onClick={() => setActiveTab('live')} isDarkMode={isDarkMode} />
          <SidebarItem icon={History} label="History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} isDarkMode={isDarkMode} />
          <SidebarItem icon={FileText} label="Reports" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} isDarkMode={isDarkMode} />
          <SidebarItem icon={Shield} label="Shared Access" active={activeTab === 'telemedicine'} onClick={() => setActiveTab('telemedicine')} isDarkMode={isDarkMode} />
          <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} isDarkMode={isDarkMode} />
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className={cn(
            "p-4 rounded-2xl mb-4 transition-colors",
            isDarkMode ? "bg-slate-800" : "bg-slate-50"
          )}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
                {user.profileImage ? <img src={user.profileImage} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <UserIcon size={20} className="text-blue-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-bold truncate", isDarkMode ? "text-white" : "text-slate-900")}>{user.name}</p>
                <p className="text-[10px] text-slate-400 truncate uppercase tracking-wider font-bold">Patient ID: {user.userId.slice(0, 8)}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 text-rose-600 text-sm font-bold py-2 rounded-lg hover:bg-rose-50 transition-colors"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
          
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", isSimulatorRunning ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Device Status</span>
            </div>
            {latestReading?.battery !== undefined && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                <Battery size={12} className={latestReading.battery < 20 ? "text-rose-500" : "text-slate-400"} />
                {latestReading.battery}%
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className={cn(
          "h-20 border-b px-8 flex items-center justify-between shrink-0 transition-colors duration-500",
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
        )}>
          <div>
            <h2 className={cn("text-xl font-bold", isDarkMode ? "text-white" : "text-slate-900")}>
              {activeTab === 'dashboard' && 'Health Overview'}
              {activeTab === 'live' && 'Live Vitals Stream'}
              {activeTab === 'history' && 'Historical Trends'}
              {activeTab === 'reports' && 'Medical Reports'}
              {activeTab === 'telemedicine' && 'Shared Access Management'}
              {activeTab === 'settings' && 'System Settings'}
            </h2>
            <p className={cn("text-xs font-medium", isDarkMode ? "text-slate-500" : "text-slate-400")}>
              {safeFormat(new Date(), 'EEEE, MMMM do, yyyy')}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={toggleSimulator}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                isSimulatorRunning 
                  ? "bg-rose-50 text-rose-600 border border-rose-100" 
                  : "bg-emerald-50 text-emerald-600 border border-emerald-100"
              )}
            >
              {isSimulatorRunning ? <Pause size={16} /> : <Play size={16} />}
              {isSimulatorRunning ? 'Stop Simulator' : 'Start Simulator'}
            </button>
            
            <div className={cn("h-8 w-[1px] mx-2", isDarkMode ? "bg-slate-800" : "bg-slate-200")} />
            
            <button className={cn(
              "p-2 rounded-xl transition-colors relative",
              isDarkMode ? "text-slate-500 hover:text-white hover:bg-slate-800" : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"
            )}>
              <Bell size={20} />
              {alerts.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />}
            </button>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          
          {/* Dashboard View */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                  title="Systolic" 
                  value={latestReading?.systolic || '--'} 
                  unit="mmHg" 
                  status={latestReading?.status}
                  icon={TrendingUp} 
                  color="bg-blue-600" 
                  isDarkMode={isDarkMode}
                />
                <StatCard 
                  title="Diastolic" 
                  value={latestReading?.diastolic || '--'} 
                  unit="mmHg" 
                  icon={TrendingDown} 
                  color="bg-indigo-500" 
                  isDarkMode={isDarkMode}
                />
                <StatCard 
                  title="Pulse Rate" 
                  value={latestReading?.pulse || '--'} 
                  unit="bpm" 
                  icon={Activity} 
                  color="bg-rose-500" 
                  isDarkMode={isDarkMode}
                />
                <StatCard 
                  title="Battery" 
                  value={latestReading?.battery !== undefined ? `${latestReading.battery}%` : '--'} 
                  unit="" 
                  icon={Battery} 
                  color="bg-emerald-500" 
                  isDarkMode={isDarkMode}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Live Graph Card */}
                <div className={cn(
                  "lg:col-span-2 p-6 rounded-3xl border shadow-sm transition-all duration-500",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                )}>
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className={cn("text-lg font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Vitals Real-time Trend</h3>
                      <p className="text-xs text-slate-400 font-medium">Live monitoring of BP and Pulse</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsLive(!isLive)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                          isLive ? "bg-blue-50 text-blue-600" : (isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500")
                        )}
                      >
                        {isLive ? 'Live Streaming' : 'Paused'}
                      </button>
                    </div>
                  </div>
                  
                  <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[...readings].reverse().slice(-30)}>
                        <defs>
                          <linearGradient id="colorSys" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorPulse" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#F43F5E" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#1E293B" : "#F1F5F9"} />
                        <XAxis 
                          dataKey="timestamp" 
                          tickFormatter={(val) => safeFormat(val, 'HH:mm:ss')}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fill: '#94A3B8' }}
                          minTickGap={30}
                        />
                        <YAxis 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fill: '#94A3B8' }}
                          domain={[40, 180]}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF',
                            color: isDarkMode ? '#F8FAFC' : '#0F172A'
                          }}
                          labelFormatter={(val) => safeFormat(val, 'HH:mm:ss')}
                        />
                        <Area type="monotone" dataKey="systolic" stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#colorSys)" name="Systolic" />
                        <Area type="monotone" dataKey="diastolic" stroke="#6366F1" strokeWidth={3} fillOpacity={0} name="Diastolic" />
                        <Area type="monotone" dataKey="pulse" stroke="#F43F5E" strokeWidth={2} fillOpacity={1} fill="url(#colorPulse)" name="Pulse" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Alerts & Insights */}
                <div className="space-y-6">
                  <div className={cn(
                    "p-6 rounded-3xl border shadow-sm h-full transition-all duration-500",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  )}>
                    <h3 className={cn("text-lg font-bold mb-6 flex items-center gap-2", isDarkMode ? "text-white" : "text-slate-900")}>
                      <Bell size={20} className="text-blue-600" />
                      Recent Alerts
                    </h3>
                    
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      <AnimatePresence initial={false}>
                        {alerts.length === 0 ? (
                          <div className="text-center py-12">
                            <div className={cn(
                              "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3",
                              isDarkMode ? "bg-slate-800" : "bg-slate-50"
                            )}>
                              <CheckCircle size={24} className="text-slate-300" />
                            </div>
                            <p className="text-sm text-slate-400 font-medium">No active alerts</p>
                          </div>
                        ) : (
                          alerts.map((alert, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -20 }}
                              className={cn(
                                "p-4 rounded-2xl border flex gap-3 transition-colors",
                                isDarkMode 
                                  ? (alert.type === 'BP_ALERT' ? "bg-rose-900/20 border-rose-900/30" : "bg-amber-900/20 border-amber-900/30")
                                  : (alert.type === 'BP_ALERT' ? "bg-rose-50 border-rose-100" : "bg-amber-50 border-amber-100")
                              )}
                            >
                              <AlertCircle size={20} className={alert.type === 'BP_ALERT' ? "text-rose-600" : "text-amber-600"} />
                              <div>
                                <p className={cn("text-xs font-bold mb-1", isDarkMode ? "text-white" : "text-slate-900")}>{alert.message}</p>
                                <p className="text-[10px] text-slate-500 font-medium">{safeFormat(alert.reading.timestamp, 'HH:mm:ss')}</p>
                              </div>
                            </motion.div>
                          ))
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Live Monitoring View */}
          {activeTab === 'live' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className={cn(
                "p-8 rounded-3xl border shadow-sm transition-all duration-500",
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              )}>
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Real-time Vitals Stream</h3>
                    <p className="text-slate-500">High-frequency monitoring of cardiovascular activity</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors",
                      isDarkMode ? "bg-emerald-900/20 text-emerald-400 border-emerald-900/30" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                    )}>
                      <Wifi size={16} />
                      <span className="text-sm font-bold">Connected</span>
                    </div>
                    <button 
                      onClick={() => setIsLive(!isLive)}
                      className={cn(
                        "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                        isLive ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : (isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500")
                      )}
                    >
                      {isLive ? 'Live' : 'Paused'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8">
                  <div className={cn(
                    "lg:col-span-3 h-[500px] rounded-2xl p-4 transition-colors",
                    isDarkMode ? "bg-slate-950" : "bg-slate-50"
                  )}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={[...readings].reverse().slice(-50)}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#1E293B" : "#E2E8F0"} vertical={false} />
                        <XAxis 
                          dataKey="timestamp" 
                          tickFormatter={(val) => safeFormat(val, 'HH:mm:ss')}
                          tick={{ fontSize: 10, fill: '#94A3B8' }}
                        />
                        <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} domain={[40, 200]} />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF',
                            color: isDarkMode ? '#F8FAFC' : '#0F172A'
                          }}
                          labelFormatter={(val) => safeFormat(val, 'HH:mm:ss')}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="systolic" stroke="#2563EB" strokeWidth={3} dot={false} name="Systolic" />
                        <Line type="monotone" dataKey="diastolic" stroke="#6366F1" strokeWidth={3} dot={false} name="Diastolic" />
                        <Line type="monotone" dataKey="pulse" stroke="#F43F5E" strokeWidth={2} dot={false} name="Pulse" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-blue-600 p-6 rounded-2xl text-white shadow-lg shadow-blue-100">
                      <p className="text-blue-100 text-xs font-bold uppercase tracking-widest mb-1">Current Systolic</p>
                      <h4 className="text-4xl font-bold">{latestReading?.systolic || '--'}</h4>
                      <p className="text-blue-100 text-xs mt-2">mmHg</p>
                    </div>
                    <div className="bg-indigo-500 p-6 rounded-2xl text-white shadow-lg shadow-indigo-100">
                      <p className="text-indigo-100 text-xs font-bold uppercase tracking-widest mb-1">Current Diastolic</p>
                      <h4 className="text-4xl font-bold">{latestReading?.diastolic || '--'}</h4>
                      <p className="text-indigo-100 text-xs mt-2">mmHg</p>
                    </div>
                    <div className="bg-rose-500 p-6 rounded-2xl text-white shadow-lg shadow-rose-100">
                      <p className="text-rose-100 text-xs font-bold uppercase tracking-widest mb-1">Current Pulse</p>
                      <h4 className="text-4xl font-bold">{latestReading?.pulse || '--'}</h4>
                      <p className="text-rose-100 text-xs mt-2">bpm</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* History View */}
          {activeTab === 'history' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className={cn(
                "rounded-3xl border shadow-sm overflow-hidden",
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              )}>
                <div className={cn(
                  "p-8 border-b flex items-center justify-between",
                  isDarkMode ? "border-slate-800" : "border-slate-100"
                )}>
                  <div>
                    <h3 className={cn("text-2xl font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Historical Records</h3>
                    <p className="text-slate-500">Complete log of all cardiovascular readings</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        value={globalFilter ?? ''}
                        onChange={e => setGlobalFilter(e.target.value)}
                        placeholder="Search records..." 
                        className={cn(
                          "pl-10 pr-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all w-64",
                          isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-100"
                        )}
                      />
                    </div>
                    <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100">
                      <Download size={16} />
                      Export All
                    </button>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map(header => (
                            <th key={header.id} className={cn(
                              "px-8 py-5 text-[10px] font-bold uppercase tracking-widest border-b",
                              isDarkMode ? "text-slate-500 border-slate-800" : "text-slate-400 border-slate-50"
                            )}>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody className={cn("divide-y", isDarkMode ? "divide-slate-800" : "divide-slate-50")}>
                      {table.getRowModel().rows.map(row => (
                        <tr key={row.id} className={cn(
                          "transition-colors group",
                          isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-slate-50"
                        )}>
                          {row.getVisibleCells().map(cell => (
                            <td key={cell.id} className={cn(
                              "px-8 py-5 text-sm",
                              isDarkMode ? "text-slate-300" : "text-slate-600"
                            )}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className={cn(
                  "p-6 border-t flex items-center justify-between",
                  isDarkMode ? "bg-slate-800/50 border-slate-800" : "bg-slate-50 border-slate-100"
                )}>
                  <div className="flex items-center gap-4">
                    <button
                      className={cn(
                        "p-2 rounded-xl border disabled:opacity-50 transition-all",
                        isDarkMode ? "bg-slate-800 border-slate-700 hover:bg-slate-700 text-white" : "bg-white border-slate-200 hover:bg-slate-50"
                      )}
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <span className={cn("text-sm font-bold", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                      Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                    </span>
                    <button
                      className={cn(
                        "p-2 rounded-xl border disabled:opacity-50 transition-all",
                        isDarkMode ? "bg-slate-800 border-slate-700 hover:bg-slate-700 text-white" : "bg-white border-slate-200 hover:bg-slate-50"
                      )}
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <select 
                      className={cn(
                        "border rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none",
                        isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-600"
                      )}
                      value={table.getState().pagination.pageSize}
                      onChange={e => table.setPageSize(Number(e.target.value))}
                    >
                      {[10, 20, 30, 40, 50].map(pageSize => (
                        <option key={pageSize} value={pageSize}>Show {pageSize}</option>
                      ))}
                    </select>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Total Records: {readings.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Reports View */}
          {activeTab === 'reports' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <div className={cn(
                    "p-8 rounded-3xl border shadow-sm",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  )}>
                    <h3 className={cn("text-xl font-bold mb-6", isDarkMode ? "text-white" : "text-slate-900")}>Health Summary</h3>
                    <div className="grid grid-cols-3 gap-6">
                      <div className={cn("p-6 rounded-2xl", isDarkMode ? "bg-slate-800" : "bg-slate-50")}>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Avg Systolic</p>
                        <p className={cn("text-3xl font-bold", isDarkMode ? "text-white" : "text-slate-900")}>
                          {readings.length > 0 ? Math.round(readings.reduce((acc, r) => acc + r.systolic, 0) / readings.length) : '--'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">mmHg</p>
                      </div>
                      <div className={cn("p-6 rounded-2xl", isDarkMode ? "bg-slate-800" : "bg-slate-50")}>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Avg Diastolic</p>
                        <p className={cn("text-3xl font-bold", isDarkMode ? "text-white" : "text-slate-900")}>
                          {readings.length > 0 ? Math.round(readings.reduce((acc, r) => acc + r.diastolic, 0) / readings.length) : '--'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">mmHg</p>
                      </div>
                      <div className={cn("p-6 rounded-2xl", isDarkMode ? "bg-slate-800" : "bg-slate-50")}>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Avg Pulse</p>
                        <p className={cn("text-3xl font-bold", isDarkMode ? "text-white" : "text-slate-900")}>
                          {readings.length > 0 ? Math.round(readings.reduce((acc, r) => acc + r.pulse, 0) / readings.length) : '--'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">bpm</p>
                      </div>
                    </div>
                  </div>

                  <div className={cn(
                    "p-8 rounded-3xl border shadow-sm",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  )}>
                    <h3 className={cn("text-xl font-bold mb-6", isDarkMode ? "text-white" : "text-slate-900")}>Weekly Distribution</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={[...readings].reverse().slice(-100)}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#1E293B" : "#F1F5F9"} />
                          <XAxis dataKey="timestamp" hide />
                          <YAxis domain={[40, 180]} hide />
                          <Tooltip 
                            contentStyle={{ 
                              borderRadius: '16px', 
                              border: 'none', 
                              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                              backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF',
                              color: isDarkMode ? '#F8FAFC' : '#0F172A'
                            }}
                          />
                          <Area type="monotone" dataKey="systolic" stroke="#2563EB" fill="#2563EB" fillOpacity={0.1} />
                          <Area type="monotone" dataKey="diastolic" stroke="#6366F1" fill="#6366F1" fillOpacity={0.1} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className={cn(
                    "p-8 rounded-3xl border shadow-sm",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  )}>
                    <h3 className={cn("text-xl font-bold mb-6", isDarkMode ? "text-white" : "text-slate-900")}>Generate Report</h3>
                    <p className="text-sm text-slate-500 mb-8">Download your medical data in professional formats for your physician.</p>
                    <div className="space-y-4">
                      <button 
                        onClick={exportToPDF}
                        className={cn(
                          "w-full flex items-center justify-between p-4 rounded-2xl transition-all group",
                          isDarkMode ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-50 hover:bg-slate-100"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            isDarkMode ? "bg-rose-900/30 text-rose-400" : "bg-rose-100 text-rose-600"
                          )}>
                            <FileText size={20} />
                          </div>
                          <div className="text-left">
                            <p className={cn("text-sm font-bold", isDarkMode ? "text-white" : "text-slate-900")}>PDF Document</p>
                            <p className="text-[10px] text-slate-400">Professional medical format</p>
                          </div>
                        </div>
                        <Download size={18} className="text-slate-300 group-hover:text-slate-900 transition-colors" />
                      </button>
                      <button 
                        onClick={exportToExcel}
                        className={cn(
                          "w-full flex items-center justify-between p-4 rounded-2xl transition-all group",
                          isDarkMode ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-50 hover:bg-slate-100"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            isDarkMode ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-100 text-emerald-600"
                          )}>
                            <Download size={20} />
                          </div>
                          <div className="text-left">
                            <p className={cn("text-sm font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Excel Spreadsheet</p>
                            <p className="text-[10px] text-slate-400">Raw data for analysis</p>
                          </div>
                        </div>
                        <Download size={18} className="text-slate-300 group-hover:text-slate-900 transition-colors" />
                      </button>
                    </div>
                  </div>

                  <div className={cn(
                    "p-8 rounded-3xl text-white shadow-xl",
                    isDarkMode ? "bg-blue-700 shadow-blue-900/20" : "bg-blue-600 shadow-blue-100"
                  )}>
                    <h4 className="text-lg font-bold mb-2">Physician Access</h4>
                    <p className="text-blue-100 text-sm mb-6">Share a secure link with your doctor for real-time vitals monitoring.</p>
                    {!generatedLink ? (
                      <button 
                        onClick={generatePhysicianLink}
                        className={cn(
                          "w-full py-3 font-bold rounded-xl transition-colors",
                          isDarkMode ? "bg-slate-900 text-blue-400 hover:bg-slate-800" : "bg-white text-blue-600 hover:bg-blue-50"
                        )}
                      >
                        Generate Secure Link
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className={cn(
                          "p-3 rounded-xl text-xs font-mono break-all",
                          isDarkMode ? "bg-slate-900/50" : "bg-blue-700/50"
                        )}>
                          {generatedLink}
                        </div>
                        <button 
                          onClick={() => copyToClipboard(generatedLink)}
                          className={cn(
                            "w-full py-3 font-bold rounded-xl transition-colors flex items-center justify-center gap-2",
                            isDarkMode ? "bg-slate-900 text-blue-400 hover:bg-slate-800" : "bg-white text-blue-600 hover:bg-blue-50"
                          )}
                        >
                          <Download size={16} className="rotate-180" />
                          Copy Link
                        </button>
                        <button 
                          onClick={() => setGeneratedLink(null)}
                          className="w-full text-center text-xs text-blue-200 hover:text-white transition-colors"
                        >
                          Reset Link
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Shared Access View */}
          {activeTab === 'telemedicine' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  {/* Active Links */}
                  <div className={cn(
                    "p-8 rounded-3xl border shadow-sm",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  )}>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className={cn("text-xl font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Active Physician Links</h3>
                      <button 
                        onClick={() => setShowLinkGenModal(true)}
                        className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors"
                      >
                        Generate New Link
                      </button>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className={cn("border-b", isDarkMode ? "border-slate-800" : "border-slate-50")}>
                            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Doctor</th>
                            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Expires</th>
                            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</th>
                            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className={cn("divide-y", isDarkMode ? "divide-slate-800" : "divide-slate-50")}>
                          {accessLinks.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm italic">No active links found.</td>
                            </tr>
                          ) : (
                            accessLinks.map(link => (
                              <tr key={link.id} className="group">
                                <td className="px-4 py-4">
                                  <p className={cn("text-sm font-bold", isDarkMode ? "text-white" : "text-slate-900")}>{link.doctorName || 'General Access'}</p>
                                  <p className="text-[10px] text-slate-500">{link.doctorEmail || 'No email specified'}</p>
                                </td>
                                <td className="px-4 py-4 text-sm text-slate-500">
                                  {safeFormat(new Date(link.expiresAt), 'MMM d, HH:mm')}
                                </td>
                                <td className="px-4 py-4">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                    link.isActive && new Date(link.expiresAt) > new Date() 
                                      ? "bg-emerald-100 text-emerald-700" 
                                      : "bg-rose-100 text-rose-700"
                                  )}>
                                    {link.isActive && new Date(link.expiresAt) > new Date() ? 'Active' : 'Expired/Revoked'}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-right">
                                  {link.isActive && new Date(link.expiresAt) > new Date() && (
                                    <button 
                                      onClick={() => revokeLink(link.id!)}
                                      className="text-rose-600 hover:text-rose-700 text-xs font-bold transition-colors"
                                    >
                                      Revoke
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Audit Logs */}
                  <div className={cn(
                    "p-8 rounded-3xl border shadow-sm",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  )}>
                    <h3 className={cn("text-xl font-bold mb-6", isDarkMode ? "text-white" : "text-slate-900")}>Security Audit Trail</h3>
                    <div className="space-y-4">
                      {accessLogs.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 text-sm italic">No access events recorded yet.</div>
                      ) : (
                        accessLogs.map(log => (
                          <div key={log.id} className={cn(
                            "p-4 rounded-2xl flex items-center justify-between transition-colors",
                            isDarkMode ? "bg-slate-800/50 hover:bg-slate-800" : "bg-slate-50 hover:bg-slate-100"
                          )}>
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "p-2 rounded-xl",
                                isDarkMode ? "bg-blue-900/30 text-blue-400" : "bg-blue-100 text-blue-600"
                              )}>
                                <Clock size={18} />
                              </div>
                              <div>
                                <p className={cn("text-sm font-bold", isDarkMode ? "text-white" : "text-slate-900")}>
                                  {log.doctorName} accessed portal
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {log.doctorEmail} • {log.userAgent?.split(') ')[0]?.split(' (')[1] || 'Unknown Device'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={cn("text-xs font-bold", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                                {safeFormat(new Date(log.accessTime), 'MMM d, HH:mm:ss')}
                              </p>
                              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Authorized</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className={cn(
                    "p-8 rounded-3xl border shadow-sm",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  )}>
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200">
                      <Shield className="text-white" size={24} />
                    </div>
                    <h3 className={cn("text-xl font-bold mb-4", isDarkMode ? "text-white" : "text-slate-900")}>Privacy Shield</h3>
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                      Your medical data is protected by end-to-end encryption and token-based access. 
                      Physicians can only view your data while their specific token is active and unexpired.
                    </p>
                    <ul className="space-y-3">
                      {[
                        "Tokens are cryptographically unique",
                        "Access automatically expires",
                        "Every view is logged for audit",
                        "Instant revocation control"
                      ].map((item, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs font-medium text-slate-500">
                          <CheckCircle size={14} className="text-emerald-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={cn(
                    "p-8 rounded-3xl border shadow-sm",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
                  )}>
                    <h3 className={cn("text-lg font-bold mb-4", isDarkMode ? "text-white" : "text-slate-900")}>Need Help?</h3>
                    <p className="text-sm text-slate-500 mb-6">
                      If you notice any suspicious activity in your audit trail, revoke all active links immediately.
                    </p>
                    <button 
                      onClick={async () => {
                        for (const link of accessLinks) {
                          if (link.isActive) await revokeLink(link.id!);
                        }
                      }}
                      className="w-full py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-100"
                    >
                      Revoke All Access
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Settings View */}
          {activeTab === 'settings' && (
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className={cn(
                "p-8 rounded-3xl border shadow-sm",
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              )}>
                <h3 className={cn("text-xl font-bold mb-8", isDarkMode ? "text-white" : "text-slate-900")}>Profile Settings</h3>
                <div className="flex items-center gap-8 mb-10">
                  <div className="relative group">
                    <div className={cn(
                      "w-24 h-24 rounded-3xl flex items-center justify-center overflow-hidden border-4 shadow-lg",
                      isDarkMode ? "bg-slate-800 border-slate-800" : "bg-blue-100 border-white"
                    )}>
                      {editProfileImage ? (
                        <img src={editProfileImage} alt={editName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <UserIcon size={40} className="text-blue-600" />
                      )}
                    </div>
                    <div className="absolute -bottom-2 -right-2 flex gap-1">
                      <label className={cn(
                        "p-2 border rounded-xl shadow-md cursor-pointer transition-colors",
                        isDarkMode ? "bg-slate-800 border-slate-700 text-slate-300 hover:text-blue-400" : "bg-white border-slate-100 text-slate-600 hover:text-blue-600"
                      )}>
                        <Settings size={16} />
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                      <button 
                        onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                        className={cn(
                          "p-2 border rounded-xl shadow-md transition-colors",
                          isDarkMode ? "bg-slate-800 border-slate-700 text-slate-300 hover:text-blue-400" : "bg-white border-slate-100 text-slate-600 hover:text-blue-600"
                        )}
                      >
                        <UserIcon size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className={cn("text-xl font-bold", isDarkMode ? "text-white" : "text-slate-900")}>{editName}</h4>
                    <p className="text-slate-500 mb-4">{user.email}</p>
                    <div className="flex gap-3">
                      <span className={cn(
                        "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full",
                        isDarkMode ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-600"
                      )}>Premium Member</span>
                      <span className={cn(
                        "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full",
                        isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-50 text-slate-500"
                      )}>ID: {user.userId.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>

                {showAvatarPicker && (
                  <div className={cn(
                    "mb-10 p-6 rounded-2xl border animate-in zoom-in-95 duration-200",
                    isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-100"
                  )}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className={cn("text-sm font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Choose Default Avatar</h4>
                      <button onClick={() => setShowAvatarPicker(false)} className="text-slate-400 hover:text-slate-600">
                        <LogOut size={16} className="rotate-180" />
                      </button>
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                      {DEFAULT_AVATARS.map((avatar, idx) => (
                        <button 
                          key={idx}
                          onClick={() => {
                            setEditProfileImage(avatar);
                            setShowAvatarPicker(false);
                          }}
                          className={cn(
                            "w-full aspect-square rounded-xl overflow-hidden border-2 transition-all hover:scale-105",
                            editProfileImage === avatar ? "border-blue-500 ring-2 ring-blue-500/20" : "border-transparent"
                          )}
                        >
                          <img src={avatar} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-slate-500" : "text-slate-400")}>Full Name</label>
                    <input 
                      type="text" 
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={cn(
                        "w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all",
                        isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-100"
                      )} 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className={cn("text-xs font-bold uppercase tracking-widest", isDarkMode ? "text-slate-500" : "text-slate-400")}>Email Address</label>
                    <input 
                      type="email" 
                      defaultValue={user.email} 
                      disabled 
                      className={cn(
                        "w-full px-4 py-3 border rounded-xl opacity-60",
                        isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-100"
                      )} 
                    />
                  </div>
                </div>
              </div>

              <div className={cn(
                "bg-white p-8 rounded-3xl border shadow-sm",
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
              )}>
                <h3 className={cn("text-xl font-bold mb-8", isDarkMode ? "text-white" : "text-slate-900")}>System Preferences</h3>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn("font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Real-time Notifications</p>
                      <p className="text-sm text-slate-500">Get alerted immediately for abnormal vitals</p>
                    </div>
                    <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                    </div>
                  </div>
                  <div className={cn("h-[1px]", isDarkMode ? "bg-slate-800" : "bg-slate-50")} />
                  
                  {/* Black & White Mode Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn("font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Black & White Mode</p>
                      <p className="text-sm text-slate-500">Enable grayscale visual interface</p>
                    </div>
                    <div 
                      onClick={() => setIsGrayscale(!isGrayscale)}
                      className={cn(
                        "w-12 h-6 rounded-full relative cursor-pointer transition-colors",
                        isGrayscale ? "bg-blue-600" : "bg-slate-300"
                      )}
                    >
                      <motion.div 
                        animate={{ x: isGrayscale ? 24 : 4 }}
                        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm" 
                      />
                    </div>
                  </div>
                  <div className={cn("h-[1px]", isDarkMode ? "bg-slate-800" : "bg-slate-50")} />

                  {/* Dark Mode Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn("font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Dark Mode</p>
                      <p className="text-sm text-slate-500">Switch to a dark color palette</p>
                    </div>
                    <div 
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className={cn(
                        "w-12 h-6 rounded-full relative cursor-pointer transition-colors",
                        isDarkMode ? "bg-blue-600" : "bg-slate-300"
                      )}
                    >
                      <motion.div 
                        animate={{ x: isDarkMode ? 24 : 4 }}
                        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm" 
                      />
                    </div>
                  </div>
                  <div className={cn("h-[1px]", isDarkMode ? "bg-slate-800" : "bg-slate-50")} />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn("font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Device Simulator</p>
                      <p className="text-sm text-slate-500">Generate mock data for testing purposes</p>
                    </div>
                    <button 
                      onClick={toggleSimulator}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                        isSimulatorRunning 
                          ? (isDarkMode ? "bg-rose-900/30 text-rose-400" : "bg-rose-50 text-rose-600")
                          : (isDarkMode ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-600")
                      )}
                    >
                      {isSimulatorRunning ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                  <div className={cn("h-[1px]", isDarkMode ? "bg-slate-800" : "bg-slate-50")} />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn("font-bold", isDarkMode ? "text-white" : "text-slate-900")}>Data Synchronization</p>
                      <p className="text-sm text-slate-500">Auto-sync readings with cloud database</p>
                    </div>
                    <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4">
                <button className={cn(
                  "px-8 py-3 font-bold rounded-2xl transition-all",
                  isDarkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}>
                  Discard Changes
                </button>
                <button 
                  onClick={saveSettings}
                  disabled={isSaving}
                  className={cn(
                    "px-8 py-3 text-white font-bold rounded-2xl shadow-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100",
                    isDarkMode ? "bg-blue-600 shadow-blue-900/20" : "bg-blue-600 shadow-blue-100"
                  )}
                >
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
              {saveMessage && (
                <div className={cn(
                  "flex justify-end mt-4 text-sm font-bold",
                  saveMessage.includes('success') ? "text-emerald-500" : "text-rose-500"
                )}>
                  {saveMessage}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: ${isDarkMode ? '#334155' : '#E2E8F0'};
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${isDarkMode ? '#475569' : '#CBD5E1'};
        }
      `}</style>
    </div>
  );
}
