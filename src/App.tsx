import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  LogIn, 
  Play, 
  Crosshair, 
  Search, 
  User, 
  AlertTriangle, 
  Users, 
  Compass, 
  Skull, 
  Flame, 
  MapPin, 
  Clock, 
  Sparkles, 
  CheckCircle, 
  X,
  Shield,
  HelpCircle,
  RotateCcw,
  Trophy,
  PlusCircle,
  RefreshCw,
  Volume2,
  VolumeX,
  Bell,
  BellOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { audio } from './utils/audio';

let socket: Socket;

interface Player {
  id: string;
  name: string;
  role: 'Killer' | 'Forensic' | 'Investigator' | 'Accomplice' | 'Witness' | null;
  weapons: string[];
  clues: string[];
  hasVoted: boolean;
}

interface AccusationProposal {
  id: string;
  proposerId: string;
  proposerName: string;
  targetId: string;
  targetName: string;
  weapon: string;
  clue: string;
  votes: string[]; // List of player IDs who support this proposal
}

interface SceneTile {
  id: string;
  name: string;
  type: 'Location' | 'CauseOfDeath' | 'Scene';
  options: string[];
  selectedIndex: number | null;
}

interface Room {
  id: string;
  players: Record<string, Player>;
  status: 'Lobby' | 'Night' | 'Day' | 'Finished';
  solution: { weapon: string; clue: string; killerId: string } | null;
  hints: string[];
  lastVote?: {
    voterId: string;
    voterName: string;
    targetId: string;
    targetName: string;
    weapon: string;
    clue: string;
    timestamp: number;
    isCorrect: boolean;
  } | null;
  proposals?: AccusationProposal[];
  
  tiles: SceneTile[];
  tilesDeck: SceneTile[];
  round: number;
  replacesLeft: number;
  isAccompliceEnabled: boolean;
  isWitnessEnabled: boolean;
  witnessAssassinationActive?: boolean;
  assassinationResult?: { isCorrect: boolean; targetId: string; witnessId: string } | null;
}

// Preset Forensic scientist suggestions to make the game extremely rich and playable!
const PRESET_CAUSES_OF_DEATH = [
  'اختناق / خنق 🫁', 'تسمم حاد 🧪', 'فقدان شديد للدم 🩸', 'حروق بليغة 🔥', 'صدمة كهربائية ⚡', 'جرح قطعي عميق 🔪'
];

const PRESET_LOCATIONS = [
  'منزل سكني دافئ 🏡', 'حديقة عامة مظلمة 🌳', 'مكتبة قديمة غامضة 📚', 'زقاق خلفي مهجور 🏚️', 'موقع بناء نشط 🏗️', 'ميناء بحري عاصف ⚓'
];

const PRESET_VICTIM_STATE = [
  'الجثة سليمة معالمها 👤', 'تعبير وجه مرعوب 😧', 'فقدان ممتلكات شخصية 💳', 'ملابس ممزقة بالكامل 👔', 'آثار مقاومة شديدة ✊', 'جسد متجمد برداً ❄️'
];

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState(() => {
    const randomNum = Math.floor(100 + Math.random() * 900);
    return `HK-${randomNum}`;
  });
  const [playerName, setPlayerName] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [errorDetails, setErrorDetails] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [activeDayTab, setActiveDayTab] = useState<'scene' | 'council' | 'colleagues'>('scene');
  const [activeForensicToast, setActiveForensicToast] = useState<{message: string; timestamp: number} | null>(null);
  
  // Game states local
  const [selectedWeapon, setSelectedWeapon] = useState<string>('');
  const [selectedClue, setSelectedClue] = useState<string>('');
  const [hintMsg, setHintMsg] = useState<string>('');
  const [selectedInvestigatorForClue, setSelectedInvestigatorForClue] = useState<string>('');
  const [additionalClueText, setAdditionalClueText] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('');
  const [voteTarget, setVoteTarget] = useState<string>('');
  const [gameOverResult, setGameOverResult] = useState<any>(null);
  const [activeAccusation, setActiveAccusation] = useState<any>(null);
  const lastVoteTimestampRef = useRef<number>(0);

  // Auto-hide accusation notification banner after 6 seconds
  useEffect(() => {
    if (activeAccusation) {
      const timer = setTimeout(() => {
        setActiveAccusation(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [activeAccusation]);

  // Auto-hide forensic hint notification toast after 5 seconds
  useEffect(() => {
    if (activeForensicToast) {
      const timer = setTimeout(() => {
        setActiveForensicToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeForensicToast]);

  const lastStatusRef = useRef<string | null>(null);
  const lastHintsCountRef = useRef<number>(0);

  useEffect(() => {
    // connect to current host
    socket = io();

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('updateRoom', (updatedRoom: Room) => {
      setRoom(updatedRoom);
      setErrorDetails('');
      if (updatedRoom.status === 'Lobby') {
        setGameOverResult(null);
      }
    });

    socket.on('error_msg', (msg: string) => {
      setErrorDetails(msg);
    });

    socket.on('gameOver', (result) => {
      setGameOverResult(result);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('updateRoom');
      socket.off('error_msg');
      socket.off('gameOver');
      socket.disconnect();
    };
  }, []);

  // Audio trigger on room status change & new hints
  useEffect(() => {
    if (!room) {
      lastStatusRef.current = null;
      lastHintsCountRef.current = 0;
      return;
    }

    if (soundEnabled) {
      // 1. NIGHT PHASE TRIGGER
      if (room.status === 'Night' && lastStatusRef.current !== 'Night') {
        audio.playNightStart();
      }
      // 2. DAY PHASE TRIGGER
      else if (room.status === 'Day' && lastStatusRef.current !== 'Day') {
        audio.playJoin();
      }
      // 3. HINT RECEIVED
      else if (room.status === 'Day' && room.hints.length > lastHintsCountRef.current) {
        audio.playHintSound();
      }
    }

    // Capture the newest hint to display as a real-time toast banner for everyone
    if (room.status === 'Day' && room.hints.length > lastHintsCountRef.current && lastStatusRef.current === 'Day') {
      const newestHint = room.hints[room.hints.length - 1];
      if (notificationsEnabled) {
        setActiveForensicToast({ message: newestHint, timestamp: Date.now() });
      }
    }

    if (room.status === 'Lobby') {
      lastVoteTimestampRef.current = 0;
      setActiveAccusation(null);
    }

    if (room.lastVote && room.lastVote.timestamp > lastVoteTimestampRef.current) {
      lastVoteTimestampRef.current = room.lastVote.timestamp;
      if (notificationsEnabled) {
        setActiveAccusation(room.lastVote);
      }
      if (soundEnabled) {
        audio.playNightStart(); // Play dramatic deep gong
      }
    }

    lastStatusRef.current = room.status;
    lastHintsCountRef.current = room.hints.length;
  }, [room, soundEnabled, notificationsEnabled]);

  // Audio trigger on game over
  useEffect(() => {
    if (gameOverResult && soundEnabled) {
      if (gameOverResult.winners === 'Investigators') {
        audio.playWinTriumph();
      } else {
        audio.playFailSpooky();
      }
    }
  }, [gameOverResult, soundEnabled]);

  const handleJoin = () => {
    if (soundEnabled) audio.playClick();
    if (playerName && roomId) {
      socket.emit('joinRoom', { roomId, playerName });
    }
  };

  const [isAccompliceEnabled, setIsAccompliceEnabled] = useState(true);
  const [isWitnessEnabled, setIsWitnessEnabled] = useState(true);

  const handleStartGame = () => {
    if (soundEnabled) audio.playClick();
    if (roomId) {
      socket.emit('startGame', { roomId, isAccompliceEnabled, isWitnessEnabled });
    }
  };

  const handleKillerConfirm = () => {
    if (soundEnabled) audio.playClick();
    if (selectedWeapon && selectedClue) {
      socket.emit('killerSelect', { roomId, weapon: selectedWeapon, clue: selectedClue });
      // Clear selection for general UI usage afterwards
      setSelectedWeapon('');
      setSelectedClue('');
    } else {
      setErrorDetails('يجب اختيار أداة ودليل!');
    }
  };

  const handleSendHint = (customHint?: string) => {
    if (soundEnabled) audio.playClick();
    const finalHint = customHint || hintMsg;
    if (finalHint) {
      socket.emit('forensicHint', { roomId, hint: finalHint });
      setHintMsg('');
    }
  };

  const handleSendConsumeVoteClue = () => {
    if (soundEnabled) audio.playClick();
    if (selectedInvestigatorForClue && additionalClueText) {
      socket.emit('forensicConsumeVoteClue', {
        roomId,
        targetId: selectedInvestigatorForClue,
        hint: additionalClueText
      });
      setSelectedInvestigatorForClue('');
      setAdditionalClueText('');
    }
  };

  const handleProposeAccusation = () => {
    if (soundEnabled) audio.playClick();
    if (voteTarget && selectedWeapon && selectedClue) {
      socket.emit('submitAccusationProposal', { 
        roomId, 
        targetId: voteTarget, 
        weapon: selectedWeapon, 
        clue: selectedClue 
      });
      // reset forms
      setVoteTarget('');
      setSelectedWeapon('');
      setSelectedClue('');
    } else {
      setErrorDetails('يجب ملء المتهم وأداة الجريمة والدليل!');
    }
  };

  const handleSupportProposal = (proposalId: string) => {
    if (soundEnabled) audio.playClick();
    if (roomId) {
      socket.emit('supportAccusationProposal', { roomId, proposalId });
    }
  };

  // Reset & start a new game locally by simply reloading or joining new session
  const handleGoLobby = () => {
    if (soundEnabled) audio.playClick();
    window.location.reload();
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-[#0c0c0e] text-slate-100 flex items-center justify-center font-sans relative overflow-hidden px-4" dir="rtl">
        {/* Floating audio control / Sound mute toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="fixed top-4 left-4 z-50 p-2.5 bg-[#16161a] hover:bg-[#1e1e24] border border-white/10 rounded-xl text-slate-300 hover:text-white transition-all cursor-pointer shadow-lg flex items-center gap-1.5 text-xs font-bold"
          title={soundEnabled ? "كتم المؤثرات الصوتية" : "تفعيل المؤثرات الصوتية"}
        >
          {soundEnabled ? (
            <>
              <Volume2 className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              <span>الصوت: مفعّل 🔊</span>
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              <span>الصوت: مكتوم 🔇</span>
            </>
          )}
        </button>

        {/* Mysterious Ambient glow background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(220,38,38,0.1)_0%,_transparent_75%)]"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-950/20 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-950/10 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="w-full max-w-lg p-8 bg-[#16161a] border border-white/10 rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] relative z-10">
          
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center border border-red-500/50 shadow-[0_0_20px_rgba(220,38,38,0.3)]">
              <Crosshair className="w-8 h-8 text-red-500 animate-pulse" />
            </div>
          </div>

          <h1 className="text-3xl font-extrabold text-center tracking-widest text-slate-100 uppercase mb-2">
            DECEPTION <br/>
            <span className="text-red-500 text-base md:text-lg tracking-wider block mt-2">خداع في هونغ كونغ</span>
          </h1>
          <p className="text-center text-slate-400 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
            لعبة جماعية مليئة بالشك والذكاء. العب دور القاتل المراوغ، الطبيب الشرعي العبقري، أو المحقق الذكي.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-400">اسم المحقق (اسم اللاعب)</label>
              <input 
                type="text" 
                maxLength={16}
                className="w-full px-4 py-3 bg-[#0c0c0e] rounded-xl border border-white/10 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500 transition-colors text-base font-medium"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="ادخل اسمك هنا..."
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">رمز الغرفة لتشاركها (تم توليده تلقائياً 🎲)</label>
                <button 
                  type="button"
                  onClick={() => {
                    const randomNum = Math.floor(100 + Math.random() * 900);
                    setRoomId(`HK-${randomNum}`);
                  }}
                  className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 font-bold cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  توليد كود جديد
                </button>
              </div>
              <input 
                type="text" 
                className="w-full px-4 py-3 bg-[#0c0c0e] rounded-xl border border-white/10 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500 transition-colors text-base font-mono font-bold"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="مثال: HK-772"
              />
            </div>
            
            {errorDetails && (
              <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorDetails}</span>
              </div>
            )}

            <button 
              onClick={handleJoin}
              disabled={!isConnected || !playerName || !roomId}
              className="w-full mt-6 py-3.5 bg-red-900/30 hover:bg-red-800/40 border border-red-500/50 text-red-100 font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer shadow-[0_0_25px_rgba(220,38,38,0.15)] disabled:opacity-50"
            >
              <LogIn className="w-5 h-5" />
              انضمام إلى الغرفة
            </button>
            
            {!isConnected ? (
              <p className="text-center text-xs text-slate-500 font-mono">جاري الاتصال بقنوات الخوادم المغلقة...</p>
            ) : (
              <p className="text-center text-[10px] text-slate-500 uppercase tracking-widest">خادم الاتصال الفوري: متصل بـ Socket.io</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const me = room.players[socket.id];
  const isHost = Object.keys(room.players)[0] === socket.id;
  const investigatorsList = (Object.values(room.players) as Player[]).filter(p => p.role === 'Investigator');

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-slate-200 font-sans flex flex-col overflow-x-hidden relative" dir="rtl">
      
      {/* Background radial gradient representing a dark investigation room */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(30,41,59,0.12)_0%,_transparent_75%)] pointer-events-none"></div>

      {/* Real-time Dramatic Vote Cast & Accusation Overlay */}
      <AnimatePresence mode="wait">
        {activeAccusation && notificationsEnabled && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -30 }}
            transition={{ type: 'spring', damping: 15, stiffness: 100 }}
            className="fixed top-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg z-50 pointer-events-none"
          >
            <div className={`p-5 rounded-2xl border backdrop-blur-md shadow-2xl relative overflow-hidden pointer-events-auto ${
              activeAccusation.isCorrect 
                ? 'bg-emerald-950/95 border-emerald-500/50 shadow-emerald-950/60' 
                : 'bg-red-950/95 border-red-500/40 shadow-red-950/60'
            }`}>
              {/* Background accent details */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-red-500 to-indigo-505 animate-pulse"></div>
              
              <button 
                onClick={() => setActiveAccusation(null)}
                className="absolute top-3 left-3 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/5 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex gap-4 items-start">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border ${
                  activeAccusation.isCorrect 
                    ? 'bg-emerald-900/40 border-emerald-400 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]' 
                    : 'bg-red-900/30 border-red-500 text-red-400 animate-pulse'
                }`}>
                  <Crosshair className="w-6 h-6" />
                </div>

                <div className="flex-1 space-y-1 text-right">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-amber-400 block font-bold">
                    🚨 توجيه إدانة جنائية متسارعة! 🚨
                  </span>
                  
                  <p className="text-sm font-medium text-slate-200 leading-normal">
                    المحقق <span className="font-extrabold text-blue-400">{activeAccusation.voterName}</span> قرر اتهام <span className="font-extrabold text-yellow-400">{activeAccusation.targetName}</span> رسمياً!
                  </p>

                  <div className="mt-2.5 p-3 bg-black/40 border border-white/5 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 font-bold shrink-0">الأداة الجنائية:</span>
                      <span className="px-2 py-0.5 bg-red-950 text-red-300 border border-red-600/30 rounded font-black">
                        {activeAccusation.weapon}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 font-bold shrink-0">الدليل المادي:</span>
                      <span className="px-2 py-0.5 bg-blue-950 text-blue-300 border border-blue-600/30 rounded font-black">
                        {activeAccusation.clue}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs pt-2.5 font-bold flex items-center gap-1.5">
                    {activeAccusation.isCorrect ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        أصابت الإدانة! تم مطابقة المعطيات وحل طلاسم اللغز بنجاح! 🎉
                      </span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1 leading-relaxed">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                        تهور المحقق! النيابة العامة ترفض الدليل. تم قيد القضية ضد مجهول، واستهلك صوت المحقق! ⚠️
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real-time Forensic Hint Toast Notification */}
      <AnimatePresence>
        {activeForensicToast && (
          <motion.div
            initial={{ opacity: 0, y: -80, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="fixed top-24 left-4 right-4 md:left-auto md:right-6 md:w-[450px] bg-[#171330]/95 border border-purple-550/50 p-4 rounded-2xl shadow-2xl z-50 text-right backdrop-blur-md"
            dir="rtl"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-purple-950/80 rounded-full border border-purple-400 flex items-center justify-center shrink-0">
                <Flame className="w-5 h-5 text-purple-300 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-purple-300 font-sans">
                    🚨 تلميح فوري من الطبيب الشرعي!
                  </span>
                  <button 
                    onClick={() => setActiveForensicToast(null)} 
                    className="w-10 h-10 -mr-2.5 -mt-2.5 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] active:bg-white/10 transition-colors focus:outline-none shrink-0"
                    title="إغلاق التنبيه"
                    aria-label="إغلاق"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-100 leading-relaxed font-sans font-extrabold pr-1">
                  {activeForensicToast.message}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nav Header */}
      <nav className="h-20 border-b border-white/10 bg-[#16161a] flex flex-col md:flex-row items-center justify-between px-6 py-4 md:py-0 shadow-xl relative z-20 gap-3">
        <div className="flex items-center space-x-4 space-x-reverse">
          <div className="w-10 h-10 bg-red-950 rounded-full flex items-center justify-center border border-red-500/50 shadow-[0_0_15px_rgba(220,38,38,0.2)]">
            <span className="text-lg font-bold text-red-100">D</span>
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-widest uppercase text-slate-100">
              DECEPTION: <span className="text-red-500">Murder in HK</span>
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">تحقيق الأدلة الصامتة وغرف الخداع اللحظية</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Mute/Unmute sound effects */}
          <button 
            type="button" 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 border border-white/5 hover:border-white/15 bg-white/5 hover:bg-white/10 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs text-slate-300"
            title={soundEnabled ? "كتم المؤثرات الصوتية" : "تفعيل المؤثرات الصوتية"}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline font-bold">الصوت: مفعّل 🔊</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline font-bold">الصوت: مكتوم 🔇</span>
              </>
            )}
          </button>

          {/* Toggle Accusation Notifications */}
          <button 
            type="button" 
            onClick={() => {
              if (soundEnabled) audio.playClick();
              setNotificationsEnabled(!notificationsEnabled);
            }}
            className="p-2 border border-white/5 hover:border-white/15 bg-white/5 hover:bg-white/10 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs text-slate-300"
            title={notificationsEnabled ? "إيقاف إشعارات الاتهامات" : "تشغيل إشعارات الاتهامات"}
          >
            {notificationsEnabled ? (
              <>
                <Bell className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline font-bold">الإشعارات: مفعّلة 🔔</span>
              </>
            ) : (
              <>
                <BellOff className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline font-bold">الإشعارات: معطلة 🔕</span>
              </>
            )}
          </button>

          <div className="h-8 w-[1px] bg-white/10 hidden md:block"></div>

          <div className="flex flex-col items-center md:items-end">
            <span className="text-[9px] uppercase tracking-wider text-slate-500">رمز الغرفة (Room Code)</span>
            <span className="text-base font-mono font-bold text-yellow-500">#{room.id}</span>
          </div>
          <div className="h-8 w-[1px] bg-white/10 hidden md:block"></div>
          <div className="flex flex-col items-center md:items-end">
            <span className="text-[9px] uppercase tracking-wider text-slate-500">المرحلة الحالية (Phase)</span>
            <span className="text-sm font-bold text-blue-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
              {
                room.status === 'Lobby' ? 'في الانتظار' :
                room.status === 'Night' ? 'مساء الاختيار والقتل' :
                room.status === 'Day' ? 'التحقيق المفتوح' : 'انتهى الجيم'
              }
            </span>
          </div>
        </div>
      </nav>

      {/* Active Area Grid */}
      <div className="flex-1 flex flex-col lg:flex-row">
        
        {/* Sidebar: Players and Status list */}
        <aside className="w-full lg:w-72 bg-[#121215] border-b lg:border-b-0 lg:border-l border-white/5 p-5 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h2 className="text-[11px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                المشتركون باللعب ({Object.keys(room.players).length})
              </h2>
              <span className="text-xs bg-white/5 px-2 py-0.5 rounded text-slate-400 font-mono">
                {room.status === 'Lobby' ? 'انتظار' : 'نشط'}
              </span>
            </div>

            <div className="space-y-2">
              {(Object.values(room.players) as Player[]).map(p => {
                const isCurrentMe = p.id === socket.id;
                return (
                  <div 
                    key={p.id} 
                    className={`p-3 rounded-lg border flex items-center justify-between transition-all duration-300 ${
                      isCurrentMe 
                        ? 'bg-red-950/20 border-red-500/30 shadow-[0_0_10px_rgba(220,38,38,0.05)]' 
                        : 'bg-white/5 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${isCurrentMe ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></div>
                      <span className={`text-sm ${isCurrentMe ? 'font-bold text-slate-100' : 'text-slate-300'}`}>
                        {p.name} {isCurrentMe && '(أنت)'}
                      </span>
                    </div>

                    {/* Display role tags dynamically under appropriate conditions */}
                    <div className="flex items-center gap-1.5">
                      {p.role === 'Forensic' && (
                        <span className="text-[9px] font-bold bg-indigo-900/40 border border-indigo-500/40 px-1.5 py-0.5 rounded-md text-indigo-300 uppercase">
                          الطبيب الشرعي
                        </span>
                      )}
                      {room.status === 'Finished' && p.role === 'Killer' && (
                        <span className="text-[9px] font-bold bg-red-900/40 border border-red-500/40 px-1.5 py-0.5 rounded-md text-red-300 uppercase">
                          القاتل القاتل
                        </span>
                      )}
                      
                      {/* Check mark for voted */}
                      {p.hasVoted && (
                        <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 font-mono">
                          صوّت ✓
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick game info card */}
          <div className="mt-8 pt-4 border-t border-white/5">
            <div className="p-3.5 bg-[#16161a] border border-white/10 rounded-xl space-y-2.5">
              <span className="text-[9px] uppercase tracking-wider text-slate-500 block">مرشد اللعبة السريع 💡</span>
              <p className="text-xs text-slate-400 leading-relaxed">
                {room.status === 'Lobby' && 'بمجرد انضمام الجميع، يجب على صاحب الغرفة الضغط على "بدء اللعبة" لتوزيع الأدوار وتحديد القاتل.'}
                {room.status === 'Night' && 'المرفأ مظلم. القاتل يختار سلاحه ودليله السري من بطاقاته بالأسفل. الطبيب الشرعي يلاحظ الاختيار.'}
                {room.status === 'Day' && 'تلميحات الطبيب الشرعي تضيء على لوحة الحقيقة. على المحققين مناقشتها وتوجيه الإدانة لكشف هوية القاتل.'}
                {room.status === 'Finished' && 'انتهت اللعبة! تبيّنت الحقيقة أو هرب الجاني بأفعاله الشنيعة.'}
              </p>
            </div>
          </div>
        </aside>

        {/* Main Panel Content */}
        <main className="flex-1 p-6 relative flex flex-col justify-between overflow-y-auto">
          
          {/* Main Container */}
          <div className="space-y-6 flex-1">
            <AnimatePresence mode="wait">
              {/* LOBBY PHASE */}
              {room.status === 'Lobby' && (
                <motion.div
                  key="lobby"
                  initial={{ opacity: 0, scale: 0.98, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -30 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full flex flex-col items-center justify-center text-center space-y-6 py-12"
                >
                <div className="p-6 bg-[#16161a] border border-white/10 rounded-2xl max-w-lg space-y-4 shadow-xl">
                  <div className="w-12 h-12 bg-indigo-900/30 rounded-full flex items-center justify-center border border-indigo-500/50 mx-auto">
                    <Users className="w-6 h-6 text-indigo-400" />
                  </div>
                  <h3 className="text-xl font-bold">بوابة الانتظار والمجلس</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    نحن بانتظار دخول بقية الزملاء المحققين لكي نقوم بتوليد أدلة الجرائم العشوائية من المختبر وبث المهام السرية. يرجى إرسال الرمز <strong className="text-yellow-500 font-mono">#{room.id}</strong> لأصدقائك.
                  </p>

                  {isHost && (
                    <div className="p-4 bg-[#0c0c0e]/60 border border-white/5 rounded-xl space-y-3 text-right" dir="rtl">
                      <h4 className="text-xs font-mono text-purple-400 font-bold uppercase tracking-wider">⚙️ إعدادات الأدوار السرية المتاحة:</h4>
                      <div className="flex items-center justify-between gap-4 p-2.5 bg-[#16161a] border border-white/5 rounded-lg">
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-100">الشريك السري (Accomplice) 🤝</div>
                          <div className="text-[10px] text-slate-400">يعلم شريك الجريمة (القاتل) وأدلتها، ويساعده في تضليل المحققين.</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isAccompliceEnabled}
                          onChange={(e) => {
                            if (soundEnabled) audio.playClick();
                            setIsAccompliceEnabled(e.target.checked);
                          }}
                          className="w-4 h-4 cursor-pointer accent-purple-500 rounded border-slate-700 bg-slate-900 focus:ring-0"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4 p-2.5 bg-[#16161a] border border-white/5 rounded-lg">
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-100">الشاهد الصامت (Witness) 👁️</div>
                          <div className="text-[10px] text-slate-400">يعلم من هم الأشرار دون معرفة الحل، وإذا كشف تآمره في النهاية يفوز الأشرار!</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isWitnessEnabled}
                          onChange={(e) => {
                            if (soundEnabled) audio.playClick();
                            setIsWitnessEnabled(e.target.checked);
                          }}
                          className="w-4 h-4 cursor-pointer accent-purple-500 rounded border-slate-705 bg-slate-900 focus:ring-0"
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-4 flex flex-col sm:flex-row justify-center gap-3">
                    {isHost ? (
                      <>
                        <button 
                          onClick={handleStartGame}
                          className="px-8 py-3 bg-red-900/30 hover:bg-red-800/40 border border-red-500/50 text-red-100 font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-[0_4px_20px_rgba(220,38,38,0.15)] cursor-pointer"
                        >
                          <Play className="w-4 h-4" />
                          توزيع الأدوار وبدء اللعبة
                        </button>
                        
                        <button 
                          onClick={() => {
                            socket.emit('addBot', room.id);
                          }}
                          className="px-6 py-3 bg-[#1e1e24] hover:bg-indigo-950/40 border border-indigo-500/30 hover:border-indigo-500/60 text-indigo-200 font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer"
                        >
                          <span>إضافة لاعب آلي (ذكاء اصطناعي) 🤖</span>
                        </button>
                      </>
                    ) : (
                      <div className="px-5 py-3 bg-[#0c0c0e] border border-white/5 rounded-xl text-xs text-slate-500 font-mono">
                        في انتظار المضيف لبدء التحري...
                      </div>
                    )}
                  </div>
                </div>

                {errorDetails && (
                  <p className="text-sm text-red-400 font-mono bg-red-950/20 border border-red-900/30 px-4 py-2 rounded-lg animate-pulse">{errorDetails}</p>
                )}
              </motion.div>
            )}

            {/* NIGHT PHASE (Investigator state / sleeping town) */}
            {room.status === 'Night' && me?.role !== 'Killer' && (
              <motion.div
                key="night-non-killer"
                initial={{ opacity: 0, scale: 0.98, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -30 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="min-h-[400px] flex flex-col items-center justify-center text-center space-y-4"
              >
                <div className="w-16 h-16 bg-neutral-900 border border-white/10 rounded-full flex items-center justify-center shadow-inner">
                  <Skull className="w-8 h-8 text-slate-500 animate-pulse" />
                </div>
                <h3 className="text-2xl font-bold tracking-wider blink text-slate-100">المدينة هادئة وتغط بنوم عميق...</h3>
                <p className="text-sm text-slate-400 max-w-md leading-relaxed">
                  يقوم القاتل الآن بتدبير مسرح الجريمة بالسر المطلق واختيار أداة ودليل من يده، بينما يستعد الطبيب الشرعي لتسجيل المعطيات وبدء التحليل في الفجر.
                </p>
                <div className="w-48 h-1 bg-[#16161a] rounded-full overflow-hidden mt-4">
                  <div className="h-full bg-red-600 w-1/2 rounded-full animate-infinite-loading"></div>
                </div>

                {me && me.role !== 'Forensic' && me.weapons && me.weapons.length > 0 && (
                  <div className="mt-8 p-5 bg-[#121214]/80 border border-white/5 rounded-2xl w-full max-w-lg text-right space-y-4 shadow-xl">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[#818cf8] block pb-2 border-b border-white/5 text-center">
                      💼 حقيبتك الجنائية الشخصية (بطاقاتك السريّة)
                    </span>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* Weapons */}
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider block">الأدوات (اللون الأحمر) 🔪</span>
                        <div className="space-y-1">
                          {me.weapons.map(w => (
                            <div key={w} className="px-3 py-1.5 bg-red-950/20 border border-red-500/20 text-red-100 text-xs rounded-lg font-bold text-center">
                              {w}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Clues */}
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase font-bold text-blue-500 tracking-wider block">الأدلة المادية (اللون الأزرق) 🔍</span>
                        <div className="space-y-1">
                          {me.clues.map(c => (
                            <div key={c} className="px-3 py-1.5 bg-blue-950/20 border border-blue-500/20 text-blue-100 text-xs rounded-lg font-bold text-center">
                              {c}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* KILLER ACTION IN NIGHT PHASE */}
            {room.status === 'Night' && me?.role === 'Killer' && (
              <motion.div
                key="night-killer"
                initial={{ opacity: 0, scale: 0.98, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -30 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="bg-[#16161a] border border-red-900/40 ring-1 ring-red-500/10 p-6 rounded-2xl max-w-3xl mx-auto space-y-6 shadow-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-600"></div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-extrabold text-red-400 flex items-center gap-2">
                      <Skull className="w-5 h-5 text-red-500" />
                      أنت القاتل! اختر أسلوب تخفيك 🔪
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      اختر أداة جريمة واحدة من اليسار (اللون الأحمر) ودليلاً جنائياً واحداً من اليمين (اللون الأزرق). سيظل هذا خيارك السري الذي يكشفه الطبيب الشرعي بالتدريج!
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  {/* Select weapon */}
                  <div className="space-y-3">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-red-400 block pb-1 border-b border-white/5">أدوات الجريمة المتاحة بيدك (اختر 1)</span>
                    <div className="grid grid-cols-2 gap-2">
                      {me.weapons.map(w => (
                        <button
                          key={w}
                          onClick={() => setSelectedWeapon(w)}
                          className={`p-3 rounded-xl border text-sm font-bold transition-all text-center ${
                            selectedWeapon === w
                              ? 'bg-red-950/40 border-red-500 text-red-100 shadow-[0_0_15px_rgba(220,38,38,0.25)]'
                              : 'bg-[#222228] border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Select clue */}
                  <div className="space-y-3">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-blue-400 block pb-1 border-b border-white/5">الأدلة المادية الخادعة (اختر 1)</span>
                    <div className="grid grid-cols-2 gap-2">
                      {me.clues.map(c => (
                        <button
                          key={c}
                          onClick={() => setSelectedClue(c)}
                          className={`p-3 rounded-xl border text-sm font-bold transition-all text-center ${
                            selectedClue === c
                              ? 'bg-blue-950/40 border-blue-500 text-blue-100 shadow-[0_0_15px_rgba(59,130,246,0.25)]'
                              : 'bg-[#222228] border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-slate-400">
                    القرار المحدد: {selectedWeapon ? <span className="text-red-400 font-bold">{selectedWeapon}</span> : 'لم تختر أداة'} + {selectedClue ? <span className="text-blue-400 font-bold">{selectedClue}</span> : 'لم تختر دليلاً'}
                  </div>
                  <button
                    onClick={handleKillerConfirm}
                    disabled={!selectedWeapon || !selectedClue}
                    className="w-full md:w-auto px-8 py-3 bg-red-900/40 hover:bg-red-800/50 border border-red-500 text-red-100 font-bold tracking-widest uppercase text-sm rounded-xl transition-all duration-300 disabled:opacity-40"
                  >
                    تأكيد اختيار مسرح الجريمة
                  </button>
                </div>
              </motion.div>
            )}

            {/* DAY GAME BOARD & DISCUSSION */}
            {room.status === 'Day' && (
              <motion.div
                key="day"
                initial={{ opacity: 0, scale: 0.98, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -30 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-6"
              >
                {/* 3 Game Board Tabs */}
                <div className="flex border border-white/5 bg-[#121215]/90 p-1 rounded-2xl gap-1 max-w-2xl mx-auto backdrop-blur-md shadow-2xl relative z-20">
                  <button
                    type="button"
                    onClick={() => {
                      if (soundEnabled) audio.playClick();
                      setActiveDayTab('scene');
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeDayTab === 'scene'
                        ? 'bg-purple-600/20 border border-purple-500/30 text-purple-300 font-extrabold shadow-[0_0_15px_rgba(147,51,234,0.1)]'
                        : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-250 border border-transparent'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5 text-purple-400" />
                    <span>مسرح الجريمة 🧠</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (soundEnabled) audio.playClick();
                      setActiveDayTab('council');
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeDayTab === 'council'
                        ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 font-extrabold shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                        : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-250 border border-transparent'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <span>مجلس الشورى ⚖️</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (soundEnabled) audio.playClick();
                      setActiveDayTab('colleagues');
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeDayTab === 'colleagues'
                        ? 'bg-amber-600/20 border border-amber-500/30 text-amber-350 font-extrabold shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                        : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-250 border border-transparent'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5 text-amber-400" />
                    <span>أدوات الزملاء 🎒</span>
                  </button>
                </div>

                {activeDayTab === 'scene' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >

                    {/* Tiles Grid representing the physical board plates */}
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-sans">
                     {room.tiles && room.tiles.map((tile) => {
                       const isCause = tile.type === 'CauseOfDeath';
                       const isLoc = tile.type === 'Location';
                       
                       let borderClr = 'border-emerald-500/20 hover:border-emerald-500/40';
                       let headerBg = 'bg-emerald-950/20 border-emerald-500/30';
                       let textClr = 'text-emerald-400';
                       
                       if (isCause) {
                         borderClr = 'border-red-500/20 hover:border-red-500/40';
                         headerBg = 'bg-red-950/20 border-red-500/30';
                         textClr = 'text-red-400';
                       } else if (isLoc) {
                         borderClr = 'border-purple-500/30 hover:border-purple-500/50';
                         headerBg = 'bg-purple-950/20 border-purple-500/40';
                         textClr = 'text-purple-400';
                       }

                       return (
                         <div 
                           key={tile.id} 
                           className={`bg-[#16161a] border ${borderClr} rounded-xl shadow-lg flex flex-col justify-between overflow-hidden transition-all duration-300`}
                         >
                           {/* Header plate */}
                           <div className={`p-3.5 ${headerBg} border-b flex justify-between items-center`}>
                             <span className={`text-xs font-bold ${textClr} tracking-wide flex items-center gap-1.5`}>
                               {tile.name}
                             </span>
                             
                             {tile.type === 'Scene' && me?.role === 'Forensic' && room.replacesLeft > 0 && (
                               <button
                                 onClick={() => {
                                   if (soundEnabled) audio.playClick();
                                   socket.emit('replaceTile', { roomId: room.id, tileId: tile.id });
                                 }}
                                 className="text-[10px] font-bold bg-slate-900/80 hover:bg-slate-850/90 border border-slate-700 hover:border-teal-400 text-slate-300 hover:text-teal-300 px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1"
                                 title="استبدال هذه اللوحة للحصول على تلميحات جديدة"
                               >
                                 <RefreshCw className="w-2.5 h-2.5" />
                                 <span>تبديل</span>
                               </button>
                             )}
                           </div>

                           {/* Options */}
                           <div className="p-3.5 space-y-2">
                             {tile.options.map((opt, idx) => {
                               const isSelected = tile.selectedIndex === idx;
                               let itemBg = isSelected 
                                 ? 'bg-purple-900/30 border-purple-500 text-purple-100 shadow-[0_0_12px_rgba(147,51,234,0.15)] font-bold'
                                 : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/[0.04] hover:text-slate-200';
                               
                               if (isSelected && isCause) {
                                 itemBg = 'bg-red-900/30 border-red-500 text-red-100 shadow-[0_0_12px_rgba(239,68,68,0.15)] font-bold';
                               } else if (isSelected && isLoc) {
                                 itemBg = 'bg-purple-900/30 border-purple-500 text-purple-100 shadow-[0_0_12px_rgba(147,51,234,0.15)] font-bold';
                               }

                               return (
                                 <div
                                   key={idx}
                                   onClick={() => {
                                     if (me?.role === 'Forensic') {
                                       if (soundEnabled) audio.playClick();
                                       socket.emit('placeBullet', { roomId: room.id, tileId: tile.id, optionIndex: idx });
                                     }
                                   }}
                                   className={`p-2 w-full text-xs border rounded-lg flex items-center justify-between gap-2 transition-all duration-300 ${itemBg} ${me?.role === 'Forensic' ? 'cursor-pointer hover:border-indigo-400/50' : 'cursor-default'}`}
                                 >
                                   <span className="font-medium text-right leading-relaxed flex-1">{opt}</span>
                                   
                                   <div className="flex items-center gap-1">
                                     {isSelected ? (
                                       <span className="text-[12px] animate-bounce shadow-md" title="مؤشر الطبيب الشرعي السداسي">
                                         🟣
                                       </span>
                                     ) : (
                                       me?.role === 'Forensic' && (
                                         <div className="w-3.5 h-3.5 rounded-full border border-slate-600 hover:border-indigo-400 flex items-center justify-center text-[8px] text-slate-500">
                                           🎯
                                         </div>
                                       )
                                     )}
                                   </div>
                                 </div>
                               );
                             })}
                           </div>
                         </div>
                       );
                     })}
                   </div>
                </motion.div>
                )}

                {activeDayTab === 'council' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                {/* WITNESS ASSASSINATION CRITICAL PHASE PANEL */}
                {room.witnessAssassinationActive && (
                  <div className="bg-red-950/30 border-2 border-red-500/80 rounded-2xl p-6 shadow-[0_0_30px_rgba(239,68,68,0.25)] relative overflow-hidden space-y-4 mb-6 text-right font-sans" dir="rtl">
                    <div className="absolute -top-12 -left-12 w-36 h-36 bg-red-500/10 rounded-full blur-2xl pointer-events-none"></div>
                    
                    <div className="flex flex-col md:flex-row items-center justify-between border-b border-red-500/20 pb-3 gap-4">
                      <div className="text-right flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-950/60 rounded-full border border-red-500 flex items-center justify-center animate-pulse">
                          <Skull className="w-5 h-5 text-red-500" />
                        </div>
                        <div className="text-right">
                          <h4 className="text-sm font-extrabold text-red-300">🚨 خطير جداً: مرحلة اغتيال الشاهد الصامت جارية! (Witness Assassination)</h4>
                          <p className="text-xs text-slate-300 mt-1">
                            لقد تمكّن المحققون من مطابقة أدلة القاتل بنجاح! ولكن تمنح العصابة فرصة أخيرة للنصر: إذا استطاع القاتل اغتيال <span className="text-teal-450 font-bold">الشاهد الصامت (Witness)</span> فستفوز العصابة بأكملها!
                          </p>
                        </div>
                      </div>
                      
                      <div className="px-4 py-1.5 bg-red-950 border border-red-550 text-red-105 text-xs font-bold rounded-lg uppercase tracking-wider animate-bounce">
                        مرحلة الحسم القاتل ⚡
                      </div>
                    </div>

                    {me?.role === 'Killer' ? (
                      <div className="bg-[#121216]/80 p-4 border border-red-500/30 rounded-xl space-y-4 text-right">
                        <p className="text-xs text-red-300 font-bold">
                          ⚠️ بصفتك القاتل الرئيسي، حدد محققاً واحداً تعتقد أنه "الشاهد الصامت" واضغط على زر الاغتيال لتصفية الغز وفوز العصابة:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {(Object.values(room.players) as Player[])
                            .filter(p => p.role !== 'Killer' && p.role !== 'Forensic' && p.role !== 'Accomplice')
                            .map(p => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  if (soundEnabled) audio.playClick();
                                  socket.emit('assassinateWitness', { roomId: room.id, targetId: p.id });
                                }}
                                className="p-3 bg-red-950/20 hover:bg-red-900/40 border border-red-500/40 hover:border-red-550 text-xs text-red-100 font-bold rounded-lg transition-all duration-300 shadow-md cursor-pointer text-center block"
                              >
                                اغتيال الشاهد المحتمل: {p.name} 🔫
                              </button>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-[#0a0a0c] border border-white/5 rounded-xl text-center space-y-2">
                        <div className="w-8 h-8 rounded-full bg-slate-950 border border-slate-705 flex items-center justify-center mx-auto text-sm animate-spin">
                          🌀
                        </div>
                        <p className="text-xs text-slate-300 font-semibold">
                          القاتل الرئيسي يدرس الشكوك الآن لتحديد الشاهد الصامت ومحاولة تصفيته بالرصاص السري!
                        </p>
                        <p className="text-[10px] text-slate-500 italic">
                          يرجى الالتزام بالهدوء وحبس الأنفاس... النصر على المحك للفريقين!
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Consensus & Debate Board */}
                <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
                  
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/5 pb-4 mb-5 gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-lg text-slate-100 font-bold">مجلس مداولة التحقيق والشورى الجماعي ⚖️</h3>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        نظام اللعب التوافقي: يجب أن يجتمع <span className="text-emerald-400 font-extrabold font-mono">{Math.floor((Object.values(room.players) as Player[]).filter(p => p.role === 'Investigator' && !p.hasVoted).length / 2) + 1}</span> محققين على اتهام واحد (نفس المشتبه به والأداة والدليل) لقفل القضية وإرسالها للقضاء.
                      </p>
                    </div>
                    <div className="px-3 py-1 bg-amber-950/40 border border-amber-500/30 text-amber-300 text-[11px] rounded-full font-bold">
                      الأصوات النشطة المتبقية: {(Object.values(room.players) as Player[]).filter(p => p.role === 'Investigator' && !p.hasVoted).length}
                    </div>
                  </div>

                  {(!room.proposals || room.proposals.length === 0) ? (
                    <div className="p-8 border border-dashed border-white/5 rounded-xl text-center space-y-2">
                      <HelpCircle className="w-8 h-8 mx-auto text-slate-600 animate-pulse" />
                      <p className="text-xs text-slate-400 font-semibold">لا توجد اقتراحات إدانة مسجلة جارية حالياً.</p>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        إذا كنت محققاً، استخدم لوحة التوجيه بالأسفل لاقتراح اتهام رسمي بناءً على أدلة الطبيب الشرعي.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {room.proposals.map((prop) => {
                        const hasSupported = prop.votes.includes(socket.id);
                        const currentEligibleVoters = (Object.values(room.players) as Player[]).filter(p => p.role === 'Investigator' && !p.hasVoted);
                        const reqMaj = currentEligibleVoters.length > 0 ? Math.floor(currentEligibleVoters.length / 2) + 1 : 1;
                        const progressPercent = Math.min(100, (prop.votes.length / reqMaj) * 100);

                        return (
                          <div 
                            key={prop.id} 
                            className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                              hasSupported 
                                ? 'bg-emerald-950/25 border-emerald-500/60 shadow-lg shadow-emerald-950/30' 
                                : 'bg-[#18181c] border-white/5 hover:border-white/10'
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between mb-3 border-b border-white/5 pb-2">
                                <div>
                                  <span className="text-[9px] text-slate-500 block">اقتراح إدانة مشترك ضد:</span>
                                  <span className="text-sm font-black text-slate-100 flex items-center gap-1.5 mt-0.5">
                                    <Crosshair className="w-3.5 h-3.5 text-red-500" />
                                    {prop.targetName}
                                  </span>
                                </div>
                                
                                <div className="text-left">
                                  <span className="text-[9px] text-slate-500 block">المُقترح:</span>
                                  <span className="text-xs font-bold text-indigo-400 block">{prop.proposerName}</span>
                                </div>
                              </div>

                              <div className="p-2.5 bg-black/40 rounded-lg space-y-2 border border-white/5 mb-3.5">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-500">أداة الجريمة:</span>
                                  <span className="font-extrabold text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-500/20">{prop.weapon}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-500">الدليل المادي:</span>
                                  <span className="font-extrabold text-blue-400 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/20">{prop.clue}</span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-white/5">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-400">التأييد الإجمالي:</span>
                                <span className="font-mono font-bold text-slate-200">
                                  <span className="text-emerald-400 font-black text-sm">{prop.votes.length}</span> من <span className="text-slate-400">{reqMaj}</span> أصوات الإجماع
                                </span>
                              </div>
                              
                              {/* Progress bar */}
                              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300" 
                                  style={{ width: `${progressPercent}%` }}
                                ></div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="text-[9px] text-slate-500 font-bold shrink-0">المحققون الداعمون:</span>
                                {prop.votes.map((voterId) => {
                                  const name = room.players[voterId]?.name || 'محقق مجهول';
                                  return (
                                    <span key={voterId} className="px-2 py-0.5 bg-slate-900 border border-white/5 rounded-full text-[9px] text-slate-300">
                                      👤 {name}
                                    </span>
                                  );
                                })}
                              </div>

                              {/* Vote/Support option for me if I am eligible */}
                              {me?.role === 'Investigator' && !me.hasVoted && (
                                <div className="mt-3 pt-1">
                                  {hasSupported ? (
                                    <div className="w-full py-1.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-lg flex items-center justify-center gap-1">
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      <span>صوتك مسجل على هذا الاتهام 🟢</span>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => handleSupportProposal(prop.id)}
                                      className="w-full py-2 bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/50 text-emerald-100 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                                    >
                                      تأييد ودعم هذا الاتهام الجماعي 👍
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Sub-actions based on role */}
                <div className="max-w-2xl mx-auto">

                  {/* FORENSIC PANEL (Exclusive inputs to give premium hints instantly) */}
                  {me?.role === 'Forensic' && (
                    <div className="lg:col-span-1 bg-indigo-950/20 border border-indigo-500/40 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <Flame className="w-5 h-5 text-indigo-400" />
                        <h4 className="font-extrabold text-indigo-300">مختبر الطبيب الشرعي 🔬</h4>
                      </div>

                      <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/20 rounded-xl text-right">
                        <p className="text-[11px] text-indigo-300 leading-relaxed font-sans">
                          💡 <strong>توضيح الأدوار السريّة:</strong> بصفتك الطبيب الشرعي وموجه الجريمة، ليست لديك أدوات أو أدلة خاصة بك. عملك يتركز بالكامل على لوحات مسرح الجريمة لمساعدة المحققين في الكشف عن شبكة القاتل وشريكه.
                        </p>
                      </div>
                      
                      <div className="bg-red-950/20 border border-red-900/40 p-3 rounded-xl text-center">
                        <span className="text-[10px] uppercase text-slate-400 block tracking-wider">الجريمة الحقيقية (السر المغلق للقاتل)</span>
                        <div className="mt-1 flex flex-wrap justify-center gap-2 text-xs">
                          <span className="px-2 py-1 bg-red-950 text-red-200 border border-red-500/40 rounded font-bold">الأداة: {room.solution?.weapon}</span>
                          <span className="px-2 py-1 bg-blue-950 text-blue-200 border border-blue-500/40 rounded font-bold">الدليل: {room.solution?.clue}</span>
                        </div>
                        <span className="text-[9px] text-slate-400 block mt-2">
                          صاحب الجريمة: <strong className="text-white">{(Object.values(room.players) as Player[]).find(p => p.id === room.solution?.killerId)?.name || 'غير معلوم'}</strong>
                        </span>
                      </div>

                      <div className="space-y-3.5">
                        {/* Preset cause of death buttons */}
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">تقديم سبب الوفاة فوراً:</label>
                          <div className="grid grid-cols-1 gap-1.5">
                            {PRESET_CAUSES_OF_DEATH.map(cause => (
                              <button
                                key={cause}
                                onClick={() => handleSendHint(`سبب الوفاة: ${cause}`)}
                                className="w-full text-right px-3 py-2 bg-[#222228] hover:bg-indigo-900/20 border border-white/5 hover:border-indigo-500/30 text-xs rounded-lg transition-colors text-slate-300"
                              >
                                {cause}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Preset locations buttons */}
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">تأكيد موقع الجريمة:</label>
                          <div className="grid grid-cols-1 gap-1.5">
                            {PRESET_LOCATIONS.map(loc => (
                              <button
                                key={loc}
                                onClick={() => handleSendHint(`موقع الجريمة: ${loc}`)}
                                className="w-full text-right px-3 py-2 bg-[#222228] hover:bg-indigo-900/20 border border-white/5 hover:border-indigo-500/30 text-xs rounded-lg transition-colors text-slate-300"
                              >
                                {loc}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Preset victim state buttons */}
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">حالة جسد الضحية ومعالمها:</label>
                          <div className="grid grid-cols-1 gap-1.5">
                            {PRESET_VICTIM_STATE.map(state => (
                              <button
                                key={state}
                                onClick={() => handleSendHint(`تفصيل الجسد: ${state}`)}
                                className="w-full text-right px-3 py-2 bg-[#222228] hover:bg-indigo-900/20 border border-white/5 hover:border-indigo-500/30 text-xs rounded-lg transition-colors text-slate-300"
                              >
                                {state}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Free text custom hint */}
                        <div className="pt-2 border-t border-white/5">
                          <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">كتابة تلميح حر مخصص:</label>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={hintMsg}
                              placeholder="مثال: الساعة تشير إلى الثالثة فجراً.."
                              onChange={e => setHintMsg(e.target.value)}
                              className="bg-[#0c0c0e] border border-white/10 text-xs rounded-lg px-3 py-2 flex-1 outline-none text-slate-300 placeholder-slate-600 focus:border-indigo-500"
                            />
                            <button 
                              onClick={() => handleSendHint()}
                              className="bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer text-white"
                            >
                              بث
                            </button>
                          </div>
                        </div>

                        {/* Special Clue Sacrifice Section */}
                        <div className="pt-3 border-t border-white/5 space-y-2">
                          <label className="block text-[10px] uppercase font-bold text-amber-500 tracking-wider flex items-center gap-1">
                            <span>تقديم تلميح إضافي (مقابل فداء صوت محقق) ⚠️</span>
                          </label>
                          <p className="text-[10px] text-slate-400 leading-normal">
                            اختر محققاً لم يوجّه إدانته بعد لتبث تلميحاً إضافياً في لوحة الحقيقة مقابل استهلاك شارة التصويت الخاصة به نهائياً.
                          </p>
                          <div className="space-y-2 bg-amber-950/20 border border-amber-500/25 p-2.5 rounded-xl">
                            <select
                              value={selectedInvestigatorForClue}
                              onChange={e => setSelectedInvestigatorForClue(e.target.value)}
                              className="w-full bg-[#0c0c0e] border border-white/10 text-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-amber-500 font-medium"
                            >
                              <option value="">-- اختر المحقق للتضحية بصوته --</option>
                              {(Object.values(room.players) as Player[])
                                .filter(p => p.role === 'Investigator' && !p.hasVoted)
                                .map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>

                            <input
                              type="text"
                              value={additionalClueText}
                              onChange={e => setAdditionalClueText(e.target.value)}
                              placeholder="اكتب التلميح الإضافي الهام..."
                              className="w-full bg-[#0c0c0e] border border-white/10 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-amber-500"
                            />

                            <button
                              onClick={handleSendConsumeVoteClue}
                              disabled={!selectedInvestigatorForClue || !additionalClueText}
                              className="w-full py-1.5 bg-amber-600/30 hover:bg-amber-600/45 border border-amber-500/50 text-amber-100 font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-40"
                            >
                              تأكيد بث تلميح الفداء
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>
                  )}

                  {/* INVESTIGATOR PANEL - CHARGE MURDERER */}
                  {me?.role === 'Investigator' && (
                    <div className="lg:col-span-1 bg-emerald-950/20 border border-emerald-500/40 rounded-2xl p-5 space-y-4 shadow-xl">
                      <div className="flex items-center gap-2">
                        <Search className="w-5 h-5 text-emerald-400" />
                        <h4 className="font-extrabold text-emerald-300">صندوق توجيه الإدانة الرسمية 🔬</h4>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        لديك شارة تصويت <strong>واحدة فقط</strong> طوال الجيم. اختر المتهم، ثم أدخل كلاً من الأداة والدليل المطابقين تماماً باللغة العربية كما تظهر تحت إسمه لترسل للقاضي.
                      </p>

                      {me.hasVoted ? (
                        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                          لقد قمت باستهلاك التهمة الخاصة بك. أنت الآن محلل ومستمع للنقاش.
                        </div>
                      ) : (
                        <div className="space-y-3 pt-2">
                          {/* Vote target */}
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">المتهم الرئيسي:</label>
                            <select
                              value={voteTarget}
                              onChange={e => setVoteTarget(e.target.value)}
                              className="w-full bg-[#0c0c0e] border border-white/10 text-slate-200 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-emerald-500 font-bold"
                            >
                              <option value="">-- اختر اللاعب المشتبه به --</option>
                              {(Object.values(room.players) as Player[]).filter(p => p.role !== 'Forensic' && p.id !== socket.id).map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Weapon input helper from active click */}
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">الأداة الجرميّة (اكتبها أو اخترها بالضغط)</label>
                            <input 
                              type="text"
                              value={selectedWeapon}
                              onChange={e => setSelectedWeapon(e.target.value)}
                              placeholder="مثال: سكين"
                              className="w-full bg-[#0c0c0e] border border-white/10 text-xs text-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-emerald-500"
                            />
                          </div>

                          {/* Clue input helper from active click */}
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">الدليل الجنائي (اكتبه أو اختره بالضغط)</label>
                            <input 
                              type="text"
                              value={selectedClue}
                              onChange={e => setSelectedClue(e.target.value)}
                              placeholder="مثال: بقعة دم"
                              className="w-full bg-[#0c0c0e] border border-white/10 text-xs text-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-emerald-500"
                            />
                          </div>

                          {errorDetails && (
                            <p className="text-[11px] text-red-400">{errorDetails}</p>
                          )}

                          <button
                            onClick={handleProposeAccusation}
                            disabled={!voteTarget || !selectedWeapon || !selectedClue}
                            className="w-full mt-4 py-3 bg-emerald-900/30 hover:bg-emerald-800/40 border border-emerald-500/50 text-emerald-100 font-bold text-xs rounded-xl tracking-wider transition-all cursor-pointer disabled:opacity-45"
                          >
                            اقتراح هذا الاتهام للمداولة الجماعية ⚖️
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                   {/* KILLER PANEL DURING DAY GAME (Stay low key & bluff) */}
                   {me?.role === 'Killer' && (
                     <div className="lg:col-span-1 bg-red-950/20 border border-red-500/40 rounded-2xl p-5 space-y-4 font-sans">
                       <div className="flex items-center gap-2">
                         <Skull className="w-5 h-5 text-red-400" />
                         <h4 className="font-extrabold text-red-300">أنت في بؤرة الضوء للقاتل 🔪</h4>
                       </div>
                       <p className="text-xs text-slate-300 leading-relaxed">
                         لقد اخترت الأداة <strong className="text-red-400">{room.solution?.weapon}</strong> والدليل <strong className="text-blue-400">{room.solution?.clue}</strong>. 
                         أنت بحاجة الآن إلى تمويه زملائك وتشتيت شكوكهم نحو محققين آخرين والسيطرة على التلميحات.
                       </p>
                       
                       <div className="p-3 bg-black/40 border border-white/5 rounded-xl space-y-1 text-xs">
                         <span className="text-slate-500 block">تعليمات التمويه السليمة:</span>
                         <p className="text-slate-400">- ادعِ دائمًا الشك في شخص آخر يملك تلميحات تتقاطع مع معطيات الطبيب الشرعي.</p>
                         <p className="text-slate-400">- استمع جيدا لكيفية تفسير بقية الزملاء لمعنى "سبب الوفاة".</p>
                       </div>
                     </div>
                   )}

                   {/* ACCOMPLICE PANEL */}
                   {me?.role === 'Accomplice' && (
                     <div className="lg:col-span-1 bg-purple-950/20 border border-purple-500/40 rounded-2xl p-5 space-y-4 font-sans">
                       <div className="flex items-center gap-2">
                         <Users className="w-5 h-5 text-purple-400" />
                         <h4 className="font-extrabold text-purple-300">أنت الشريك السري! 🤝</h4>
                       </div>
                       <p className="text-xs text-slate-300 leading-relaxed">
                         مهمتك الوطنية هي حماية القاتل وإبعاد عيون العدالة عنه بأي ثمن!
                       </p>
                       
                       <div className="p-3 bg-black/40 border border-white/5 rounded-xl text-xs space-y-2 text-right">
                         <div>
                           <span className="text-slate-400">القاتل الرئيسي هو:</span>
                           <span className="text-red-400 font-bold block">
                             {(Object.values(room.players) as Player[]).find(p => p.role === 'Killer')?.name || 'مساعد آلي'}
                           </span>
                         </div>
                         <div>
                           <span className="text-slate-400">أدوات الجريمة المستهدفة لحلها:</span>
                           <span className="text-yellow-400 font-bold block">
                             الأداة: {room.solution?.weapon} | الدليل: {room.solution?.clue}
                           </span>
                         </div>
                       </div>
                       <div className="text-[11px] text-slate-500 italic leading-snug">
                         💡 تذكّر: استعمل ذكائك للدفاع والتضليل والتحدث مع الزملاء بريبة عن المحققين الأبرياء.
                       </div>
                     </div>
                   )}

                   {/* WITNESS PANEL */}
                   {me?.role === 'Witness' && (
                     <div className="lg:col-span-1 bg-teal-950/20 border border-teal-500/40 rounded-2xl p-5 space-y-4 font-sans">
                       <div className="flex items-center gap-2">
                         <Search className="w-5 h-5 text-teal-400" />
                         <h4 className="font-extrabold text-teal-300">أنت الشاهد الصامت! 👁️</h4>
                       </div>
                       <p className="text-xs text-slate-300 leading-relaxed">
                         لقد رصدت الجناة من نافذة مختبرك، لكن تذكر: لو تم كشف هويتك للقاتل بالآخر فستخسرون!
                       </p>
                       
                       <div className="p-3 bg-black/40 border border-white/5 rounded-xl text-xs space-y-1.5 text-right">
                         <span className="text-slate-400 block">المشتبه بهم الأشرار في الغرفة (القاتل أو الشريك):</span>
                         <div className="font-bold text-red-300">
                           {(Object.values(room.players) as Player[])
                             .filter(p => p.role === 'Killer' || p.role === 'Accomplice')
                             .map(p => p.name)
                             .join(' و ')}
                         </div>
                       </div>
                       
                       <div className="text-[11px] text-yellow-500/80 bg-yellow-950/30 p-2.5 border border-yellow-500/10 rounded-lg leading-relaxed">
                         ⚠️ تحذير صارم: لا تعلن عن هويتك ولا تتهمهم بحدة مبالغة وإلا فسيقوم القاتل بمرمى نار "اغتيال الشاهد" ويسرق النصر! وجّه الشبهات بحكمة.
                       </div>
                     </div>
                   )}

                  {/* Cards display list of other players */}
                  </div>
                </motion.div>
                )}

                {activeDayTab === 'colleagues' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    {/* Cards display list of other players */}
                    <div className="w-full space-y-4 bg-[#121216]/50 border border-orange-500/10 rounded-2xl p-6 shadow-2xl">
                      <div className="border-b border-white/5 pb-3">
                        <h3 className="text-sm uppercase tracking-widest text-orange-400 font-mono font-bold flex items-center gap-1.5 mb-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-orange-505 animate-pulse"></span>
                          أدلة الزملاء المعرّضة للشبّهة 🎒
                        </h3>
                        <p className="text-xs text-slate-400 leading-relaxed font-sans">
                          💡 <strong>توضيح تفاعلي:</strong> انقر مباشرة على الأدوات (اللون الأحمر) أو الأدلة المادية (اللون الأزرق) لنسخ المسمّى وتسهيل تعبئة لائحة الاتهام بسرعة في مجلس الشورى!
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                       {(Object.values(room.players) as Player[]).map(p => {
                        // Skip forensic scientist and current me if they don't want to show themselves (actually showing is okay but clean to skip forensic)
                        if (p.role === 'Forensic') return null;

                        const isCurrentlyAccused = activeAccusation && activeAccusation.targetId === p.id;
                        
                        return (
                          <motion.div 
                            key={p.id}
                            animate={isCurrentlyAccused ? { 
                              scale: [1, 1.03, 0.98, 1.02, 1],
                              y: [0, -3, 2, -1, 0]
                            } : {}}
                            transition={{ duration: 0.6 }}
                            className={`p-4 bg-[#16161a] border rounded-xl space-y-3 transition-all relative overflow-hidden ${
                              isCurrentlyAccused 
                                ? 'border-red-500 ring-2 ring-red-500/40 bg-red-950/20 shadow-[0_0_20px_rgba(239,68,68,0.3)] pt-9' 
                                : p.id === socket.id 
                                  ? 'border-red-500/20 shadow-lg' 
                                  : 'border-white/10 hover:border-white/20'
                            }`}
                          >
                            {/* Target Accusation Badge Banner */}
                            {isCurrentlyAccused && (
                              <div className="absolute top-0 right-0 left-0 bg-gradient-to-r from-red-600 to-amber-600 text-white py-1 px-3 text-[9px] font-black tracking-widest uppercase flex items-center justify-center gap-1.5 animate-pulse z-10">
                                <Crosshair className="w-3 h-3 animate-spin" />
                                <span>صُوِّب إتهام رسمي نحوه 🎯</span>
                              </div>
                            )}

                            <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                              <span className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                                <User className="w-4 h-4 text-slate-500" />
                                {p.name} {p.id === socket.id && '(أنت)'}
                              </span>
                              
                              <span className="text-[9px] text-slate-500 uppercase font-mono font-bold">
                                {p.weapons.length > 0 ? 'بطاقات مشبوهة' : 'لا بطاقات'}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              {/* Weapons column */}
                              <div className="space-y-1">
                                <span className="text-[9px] uppercase font-bold text-red-500 tracking-wider">الأدوات (اللون الأحمر)</span>
                                {p.weapons.map(w => {
                                  // Click weapon to autofill investigator sheet
                                  const isSelected = selectedWeapon === w;
                                  const isAccusedWeapon = isCurrentlyAccused && activeAccusation.weapon === w;
                                  
                                  return (
                                    <button
                                      key={w}
                                      onClick={() => {
                                        if (me?.role === 'Investigator' && !me.hasVoted) {
                                          setSelectedWeapon(w);
                                        }
                                      }}
                                      className={`w-full text-right text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-all ${
                                        isAccusedWeapon
                                          ? 'bg-red-600 text-white border-red-400 font-extrabold ring-2 ring-red-500/40 animate-bounce shadow-md scale-102'
                                          : isSelected 
                                            ? 'bg-red-950/40 border-red-500 text-red-100' 
                                            : 'bg-[#0c0c0e] border-white/5 text-slate-300 hover:border-red-500/20'
                                      }`}
                                    >
                                      {w}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Clues column */}
                              <div className="space-y-1">
                                <span className="text-[9px] uppercase font-bold text-blue-500 tracking-wider">الأدلة مادية (اللون الأزرق)</span>
                                {p.clues.map(c => {
                                  // Click clue to autofill investigator sheet
                                  const isSelected = selectedClue === c;
                                  const isAccusedClue = isCurrentlyAccused && activeAccusation.clue === c;
                                  
                                  return (
                                    <button
                                      key={c}
                                      onClick={() => {
                                        if (me?.role === 'Investigator' && !me.hasVoted) {
                                          setSelectedClue(c);
                                        }
                                      }}
                                      className={`w-full text-right text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-all ${
                                        isAccusedClue
                                          ? 'bg-blue-600 text-white border-blue-400 font-extrabold ring-2 ring-blue-500/40 animate-bounce shadow-md scale-102'
                                          : isSelected 
                                            ? 'bg-blue-950/40 border-blue-500 text-blue-105' 
                                            : 'bg-[#0c0c0e] border-white/5 text-slate-300 hover:border-blue-500/20'
                                      }`}
                                    >
                                      {c}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
                )}

              </motion.div>
            )}

            {/* FINISHED / GAME OVER PHASE */}
            {room.status === 'Finished' && (
              <motion.div
                key="finished"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center justify-center text-center space-y-6 py-12 relative z-10"
              >
                <div className="w-full max-w-2xl bg-[#16161a] border border-red-500/30 p-8 rounded-2xl shadow-[0_20px_50px_rgba(220,38,38,0.2)] space-y-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-yellow-500 to-indigo-600"></div>
                  
                  <div className="w-20 h-20 bg-red-950/40 rounded-full flex items-center justify-center border border-red-500/50 mx-auto shadow-[0_0_20px_rgba(220,38,38,0.4)]">
                    <Trophy className="w-10 h-10 text-yellow-500 animate-bounce" />
                  </div>

                  <h2 className="text-3xl font-extrabold tracking-wider text-white">انتهى التحقيق والجيم!</h2>
                  
                  {/* Winner Banner */}
                  <div className="p-4 bg-gradient-to-r from-indigo-950/40 to-red-950/40 border border-white/10 rounded-xl max-w-lg mx-auto space-y-2">
                    <p className="text-xs uppercase tracking-widest text-slate-400">الفريق الفائز</p>
                    <p className="text-2xl font-black text-yellow-400 mt-1">
                      {gameOverResult?.winners === 'Investigators' ? 'فريق الأخيار والمحققين! 🕵️‍♂️✨' : 'حفنة الأشرار والقاتل! 👿😈'}
                    </p>
                    
                    {gameOverResult?.assassinationResult && (
                      <div className="p-3 bg-black/60 border border-white/5 rounded-lg text-xs leading-relaxed text-right mt-2 space-y-1.5" dir="rtl">
                        <span className="text-purple-400 font-bold block">🗡️ تفاصيل لجة الاغتيال الأخيرة (Witness Assassination Result):</span>
                        <p className="text-slate-300">
                          - القاتل حاول تصفية: <strong className="text-red-400">{(Object.values(room.players) as Player[]).find(p => p.id === gameOverResult.assassinationResult?.targetId)?.name || 'مجهول'}</strong>
                        </p>
                        <p className="text-slate-300">
                          - الشاهد الحقيقي الصامت كان: <strong className="text-teal-400 font-mono font-bold">{(Object.values(room.players) as Player[]).find(p => p.id === gameOverResult.assassinationResult?.witnessId)?.name || 'لا يوجد'}</strong>
                        </p>
                        {gameOverResult.assassinationResult.isCorrect ? (
                          <p className="text-red-400 font-extrabold text-xs mt-1.5 bg-red-950/30 p-2 rounded border border-red-500/20">
                            💀 أصاب القاتل الهدف بدقة متناهية! تم اغتيال الشاهد بنجاح واختبأت العصابة. فوز كاسح للأشرار!
                          </p>
                        ) : (
                          <p className="text-emerald-400 font-extrabold text-xs mt-1.5 bg-emerald-950/30 p-2 rounded border border-emerald-500/20">
                            🛡️ فشل القاتل في تصفية الشاهد الحقيقي! نجح الشاهد في حبس سره وفاز فريق الأخيار والمحققين الأبرار!
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Solution details */}
                  <div className="p-5 bg-[#0c0c0e] border border-white/5 rounded-xl text-right max-w-lg mx-auto space-y-3">
                    <h4 className="text-sm font-bold text-slate-400 border-b border-white/5 pb-2">تفاصيل مسرح الجريمة الحقيقية:</h4>
                    
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="bg-[#16161a] p-3 rounded-lg border border-red-500/30">
                        <span className="text-slate-500 block mb-1">منفذ الجريمة (القاتل):</span>
                        <span className="font-extrabold text-red-100 text-sm">
                          {(Object.values(room.players) as Player[]).find(p => p.id === (gameOverResult?.solution?.killerId || room.solution?.killerId))?.name || 'مساعد آلي/قاتل مخفي'}
                        </span>
                      </div>
                      
                      <div className="bg-[#16161a] p-3 rounded-lg border border-blue-500/30">
                        <span className="text-slate-500 block mb-1">أداة الجريمة المحددة:</span>
                        <span className="font-extrabold text-blue-400 text-sm">
                          {gameOverResult?.solution?.weapon || room.solution?.weapon || 'غير محدد'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-[#16161a] p-3 rounded-lg border border-yellow-500/30 text-center text-sm font-bold text-yellow-300">
                      الدليل الحاسم للغز: <strong className="text-white underline">{gameOverResult?.solution?.clue || room.solution?.clue || 'غير محدد'}</strong>
                    </div>
                  </div>

                  {/* Action buttons exactly in the center of the screen */}
                  <div className="pt-4 flex flex-col md:flex-row justify-center gap-4 max-w-xl mx-auto">
                    {isHost ? (
                      <button 
                        onClick={() => {
                          socket.emit('restartRoom', room.id);
                        }}
                        className="px-8 py-3.5 bg-indigo-900/40 hover:bg-indigo-800/50 border border-indigo-500 text-indigo-100 font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-[0_4px_20px_rgba(99,102,241,0.2)] cursor-pointer text-xs w-full"
                      >
                        <RotateCcw className="w-4 h-4" />
                        العب مجدداً بنفس الغرفة والمحققين 🔄
                      </button>
                    ) : (
                      <div className="px-5 py-3.5 bg-indigo-950/20 border border-indigo-500/30 rounded-xl text-xs text-indigo-300 font-mono w-full text-center">
                        بانتظار المضيف لإعادة تفعيل الغرفة مجدداً...
                      </div>
                    )}
                    
                    <button 
                      onClick={handleGoLobby}
                      className="px-6 py-3.5 bg-slate-900/40 hover:bg-slate-800/50 border border-slate-500/30 text-slate-300 font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer text-xs w-full"
                    >
                      <PlusCircle className="w-4 h-4" />
                      إنشاء غرفة مستقلة جديدة 🚪
                    </button>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>

          </div>

          {/* Bottom Card Identity Panel for immersive layout */}
          <footer className="mt-8 pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#16161a] border border-white/10 flex items-center justify-center text-slate-400">
                <Shield className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h4 className="text-[10px] uppercase font-bold tracking-widest text-[#818cf8]">حساب الهوية للاتصال</h4>
                <p className="text-base font-bold text-white">{playerName || 'اسم مستعار'} <span className="text-xs font-mono text-slate-500 font-normal">#{socket?.id?.slice(0, 5) || '0000'}</span></p>
                <p className="text-xs text-slate-400 mt-0.5">حلل تلميحات الطبيب الشرعي وتعاون لكشف الجاني.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleGoLobby}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                إنشاء غرفة مستقلة جديدة
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
