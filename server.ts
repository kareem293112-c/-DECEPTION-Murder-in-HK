import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;

const WEAPONS = [
  'سكين', 'سم', 'حبل', 'فأس', 'مسدس', 'حقنة', 'وسادة', 'قنبلة', 'سيف', 'مقص',
  'مطرقة', 'مفك', 'منشار', 'بندقية', 'عصا', 'قوس', 'سلك', 'مشرط', 'مجرفة', 'مخالب',
  'أحجار ثقيلة', 'غاز سام', 'شعلة نار', 'منفضة سجائر معدنية', 'كأس زجاج مكسور', 'قضيب حديدي',
  'مذيب كيميائي', 'خنجر أثري', 'صاعق كهربائي', 'جرعة دواء زائدة', 'سماد زراعي قاتل', 'مبيد حشري',
  'كابل كهربائي مكشوف', 'مفك براغي حاد', 'بندقية صيد', 'غبار الزرنيخ', 'شظية جليدية', 'زجاجة مكسورة',
  'قنبلة يدوية', 'رماد بركاني', 'مطرقة حديدية رئيسية', 'حزام جلدي', 'مكيف هواء معطل', 'زناد بندقية قديمة',
  'آلة حادة للقطع', 'أثقال جدارية'
];
const CLUES = [
  'بقعة دم', 'شاش طبي', 'محفظة', 'ساعة مكسورة', 'عقب سيجارة', 'منديل', 'زر قميص',
  'خاتم', 'مفتاح', 'بطاقة شخصية', 'قلم', 'نظارة', 'رسالة', 'إيصال', 'صورة',
  'كتاب', 'حذاء', 'قفاز', 'شعر', 'بصمة',
  'بقعة زيت', 'خصلة شعر أشقر', 'رذاذ عطر', 'تراب طيني', 'رماد سيجارة', 'مصحح مائي مجفف',
  'فنجان قهوة دافئ', 'مذكرة يومية مسكوبة', 'علبة دواء فارغة', 'قصاصة ظفر', 'مشبك ورق معدني',
  'ألياف ملابس صوفية', 'أحمر شفاه', 'سماعة أذن وسخة', 'تذكرة قطار ملغية', 'خاتم زواج فضي',
  'عقد مخرّز مكسور', 'فاتورة طبيب شرعي', 'ساعة يدوية متوقفة', 'قطرة عين دائرية', 'قطعة قماش حريرية',
  'أوراق نقدية ممزقة', 'مظروف بريدي مفتوح', 'بقايا طعام معضوض', 'خيط خياطة ملون', 'سلسلة مفاتيح صدئة'
];

const PEOPLES = [
  'الرائد مأمون 🕵️', 'الملازم سليم 🔍', 'الخبيرة منيرة 🧪', 'المحققة زينة 🧠', 'المتحري صخر 💼', 'الدكتور وفيق 🧬', 'العميل نهاد 👁️', 'المفتش غسان 📋'
];

const PRESET_CAUSES_OF_DEATH = [
  'اختناق / خنق 🫁', 'تسمم حاد 🧪', 'فقدان شديد للدم 🩸', 'حروق بليغة 🔥', 'صدمة كهربائية ⚡', 'جرح قطعي عميق 🔪'
];

const PRESET_LOCATIONS = [
  'منزل سكني دافئ 🏡', 'حديقة عامة مظلمة 🌳', 'مكتبة قديمة غامضة 📚', 'زقاق خلفي مهجور 🏚️', 'موقع بناء نشط 🏗️', 'ميناء بحري عاصف ⚓'
];

const PRESET_VICTIM_STATE = [
  'الجثة سليمة معالمها 👤', 'تعبير وجه مرعوب 😧', 'فقدان ممتلكات شخصية 💳', 'ملابس ممزقة بالكامل 👔', 'آثار مقاومة شديدة ✊', 'جسد متجمد برداً ❄️'
];

interface Player {
  id: string;
  name: string;
  role: 'Killer' | 'Forensic' | 'Investigator' | 'Accomplice' | 'Witness' | null;
  weapons: string[];
  clues: string[];
  hasVoted: boolean;
  isBot?: boolean;
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
  
  // Deception Scene Board
  tiles: SceneTile[];
  tilesDeck: SceneTile[];
  round: number;
  replacesLeft: number;
  isAccompliceEnabled: boolean;
  isWitnessEnabled: boolean;
  witnessAssassinationActive?: boolean;
  assassinationResult?: { isCorrect: boolean; targetId: string; witnessId: string } | null;
}

const rooms: Record<string, Room> = {};

const DEATHTILE: SceneTile = {
  id: 'cause_of_death',
  name: 'سبب الوفاة 🩸',
  type: 'CauseOfDeath',
  options: [
    'اختناق / خنق 🫁',
    'تسمم حاد / جرعة مفرطة 🧪',
    'فقدان شديد للدم / نزيف 🩸',
    'صدمة وحروق بليغة 🔥',
    'صعق كهربائي بليغ ⚡',
    'جرح قطعي / اختراق عميق 🔪'
  ],
  selectedIndex: null
};

const LOCATION_TILES: SceneTile[] = [
  {
    id: 'location_indoor',
    name: 'موقع الجريمة العام 📍',
    type: 'Location',
    options: [
      'غرفة معيشة / منزل هادئ 🏡',
      'حديقة عامة غامضة 🌳',
      'مكتبة قديمة غامضة 📚',
      'زقاق خلفي مهجور 🏚️',
      'مطبخ / مطعم مزدحم 🍳',
      'ميناء بحري / سفينة عاصفة ⚓'
    ],
    selectedIndex: null
  },
  {
    id: 'location_outdoor',
    name: 'موقع الجريمة البديل 📍',
    type: 'Location',
    options: [
      'فندق وسبا مرفه 🏨',
      'موقع بناء وتحت الصيانة 🏗️',
      'طرقات وسكة قطار مهجورة 🛤️',
      'سيارة أجرة / مركبة مغلقة 🚗',
      'شاطئ بحر رملي رطب 🏖️',
      'متجر تجاري مزدحم 🛒'
    ],
    selectedIndex: null
  }
];

const SCENE_TILES_DECK_PRESET: SceneTile[] = [
  {
    id: 'scene_body',
    name: 'حالة جسد الضحية ومعالمها 👤',
    type: 'Scene',
    options: [
      'الجسد سليم ومنظم كأنه نائم 😴',
      'تعبير وجه مرعوب جداً 😧',
      'آثار عنف ومقاومة شديدة ✊',
      'جسد بارد ومتجمد تماماً ❄️',
      'مغطى كلياً بأغطية أو أكياس 👤',
      'ملابس ممزقة بالكامل 👔'
    ],
    selectedIndex: null
  },
  {
    id: 'scene_clothes',
    name: 'ملابس وأناقة الضحية 👕',
    type: 'Scene',
    options: [
      'أنيقة ورسمية جداً 👔',
      'ممزقة ومهترئة ورثة 👕',
      'مبللة أو ملطخة بسوائل غريبة 💦',
      'ملابس يومية عادية كالجينز 👟',
      'مفقودة أو عارية جزئياً 🩳',
      'ملابس متسخة بالأتربة أو الطين 🌪️'
    ],
    selectedIndex: null
  },
  {
    id: 'scene_weather',
    name: 'بيئة مسرح الجريمة والطقس 🌧️',
    type: 'Scene',
    options: [
      'حرارة شديدة ولهيب 🔥',
      'برودة قارسة وصقيع ❄️',
      'رطوبة ماطرة ومبللة 🌧️',
      'ظلام دامس بلا أضواء 🌙',
      'رياح عاتية ومحملة بالأتربة 🌪️',
      'جو مشمس وصافٍ وساكن ☀️'
    ],
    selectedIndex: null
  },
  {
    id: 'scene_time',
    name: 'توقيت ارتكاب الجريمة التقريبي ⏰',
    type: 'Scene',
    options: [
      'وقت الفجر / الشروق 🌅',
      'الصباح الباكر والنشاط ☀️',
      'منتصف النهار / الظهيرة ☀️',
      'وقت الغروب / المساء 🌇',
      'منتصف الليل الحالك 🌌',
      'غير معروف أو مشوه عمداً ❓'
    ],
    selectedIndex: null
  },
  {
    id: 'scene_trace',
    name: 'الأثر المتبقي في موقع الجريمة 🔍',
    type: 'Scene',
    options: [
      'بصمات أصابع واضحة للعامة ✋',
      'آثار أقدام أو طين على الأرض 👣',
      'بقع دماء متناثرة هنا وهناك 🩸',
      'أغراض شخصية مبعثرة ومتناثرة 🎒',
      'روائح غريبة أو غاز متسرب 💨',
      'خصلات شعر أو ألياف قماش 🧵'
    ],
    selectedIndex: null
  },
  {
    id: 'scene_relationship',
    name: 'علاقة الضحية الاجتماعية بالقاتل 👥',
    type: 'Scene',
    options: [
      'أقارب / صلة رحم أو عائلة واحدة 👨‍👩‍👧‍👦',
      'أصدقاء مقربون وموثوقون 👥',
      'زملاء عمل أو مهنة مشتركة 💼',
      'علاقة عاطفية أو زوجية 💖',
      'خصوم في التجارة أو أعداء ⚔️',
      'غرباء تماماً لا رابط بينهم 👥'
    ],
    selectedIndex: null
  },
  {
    id: 'scene_general_state',
    name: 'الحالة العامة لغرفة مسرح الجريمة 🏚️',
    type: 'Scene',
    options: [
      'منظمة ومرتبة كأنها نظيفة ✨',
      'تكسير وفوضى مروعة للأثاث 🌪️',
      'معالم احتراق خفيف أو رماد 🔥',
      'مليئة بخيوط العنكبوت والتعفن 🕸️',
      'غمر طفيف بالمياه أو سوائل 💧',
      'تلاعب متعمد بالأثاث لتشتيت الأمن 🛠️'
    ],
    selectedIndex: null
  },
  {
    id: 'scene_victim_belongings',
    name: 'مقتنيات تم العثور عليها مع الضحية 🎒',
    type: 'Scene',
    options: [
      'مبالغ مالية أو بطاقات بنكية 💰',
      'مستندات وأوراق عقود هامة 📄',
      'حقيبة مغلقة بمفتاح أو شيفرة 💼',
      'جهاز هاتف ذكي ومضيء 📱',
      'مفاتيح سيارة أو منزل بيدها 🔑',
      'لا شيء، تم جرد الضحية كلياً 🕳️'
    ],
    selectedIndex: null
  },
  {
    id: 'scene_sounds',
    name: 'الأصوات المحيطة لحظة الوفاة 🔊',
    type: 'Scene',
    options: [
      'هدوء تام وصمت مطبق ومفزع 🔇',
      'أصوات صراخ أو استغاثة عالية 🗣️',
      'صوت تكسر زجاج مباغت 🪟',
      'أصوات برق ورعد ومطر شديد ⚡',
      'وقع خطوات هروب متسارعة 👣',
      'أصوات سيارات وضجيج خارجي 🚗'
    ],
    selectedIndex: null
  },
  {
    id: 'scene_wound',
    name: 'طبيعة الضرر البدني للضحية 🩺',
    type: 'Scene',
    options: [
      'سطحي جداً وطفيف 🩹',
      'عميق ومخترق للقلب أو الصدر 🫀',
      'متركز بالرأس والجمجمة 🧠',
      'جروح متعددة في الأطراف 🦵',
      'لا توجد علامات ضرر مرئية 👤',
      'متعدد بأسلحة مختلفة وطعنات ⚖️'
    ],
    selectedIndex: null
  }
];

function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length, randomIndex;
  const newArray = [...array];
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [newArray[currentIndex], newArray[randomIndex]] = [
      newArray[randomIndex], newArray[currentIndex]
    ];
  }
  return newArray;
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, playerName }) => {
      // Create room if it doesn't exist
      if (!rooms[roomId]) {
        rooms[roomId] = {
          id: roomId,
          players: {},
          status: 'Lobby',
          solution: null,
          hints: [],
          proposals: [],
          tiles: [],
          tilesDeck: [],
          round: 1,
          replacesLeft: 2,
          isAccompliceEnabled: true,
          isWitnessEnabled: true
        };
      }
      
      const room = rooms[roomId];
      if (room.status !== 'Lobby') {
        socket.emit('error_msg', 'اللعبة قد بدأت بالفعل.');
        return;
      }

      room.players[socket.id] = {
        id: socket.id,
        name: playerName,
        role: null,
        weapons: [],
        clues: [],
        hasVoted: false
      };

      socket.join(roomId);
      io.to(roomId).emit('updateRoom', room);
    });

    socket.on('addBot', (roomId) => {
      const room = rooms[roomId];
      if (!room) return;
      if (room.status !== 'Lobby') return;

      const botCount = Object.values(room.players).filter(p => p.isBot).length;
      if (botCount >= 6) {
        socket.emit('error_msg', 'الحد الأقصى للروبوتات المسجلة هو 6 فقط.');
        return;
      }

      const botId = `bot_${Math.random().toString(36).substring(2, 9)}`;
      const usedNames = Object.values(room.players).map(p => p.name);
      const availableNames = PEOPLES.filter(name => !usedNames.includes(name));
      const botName = availableNames[Math.floor(Math.random() * availableNames.length)] || `مساعد آلي ${botCount + 1}`;

      room.players[botId] = {
        id: botId,
        name: botName,
        role: null,
        weapons: [],
        clues: [],
        hasVoted: false,
        isBot: true
      };

      io.to(roomId).emit('updateRoom', room);
    });

    function checkAndExecuteProposal(roomId: string, proposalId: string) {
      const room = rooms[roomId];
      if (!room || !room.proposals) return;

      const propIndex = room.proposals.findIndex(p => p.id === proposalId);
      if (propIndex === -1) return;

      const proposal = room.proposals[propIndex];

      const eligibleVoters = Object.values(room.players).filter(p => p.role === 'Investigator' && !p.hasVoted);
      const eligibleCount = eligibleVoters.length;
      const majorityRequired = eligibleCount > 0 ? Math.floor(eligibleCount / 2) + 1 : 1;

      if (proposal.votes.length >= majorityRequired) {
        // We have majority! Execute the consensus vote
        const target = room.players[proposal.targetId];
        const isCorrect = !!(room.solution &&
            proposal.targetId === room.solution.killerId && 
            proposal.weapon === room.solution.weapon && 
            proposal.clue === room.solution.clue);

        room.lastVote = {
          voterId: 'consensus',
          voterName: 'إجماع المحققين',
          targetId: proposal.targetId,
          targetName: proposal.targetName,
          weapon: proposal.weapon,
          clue: proposal.clue,
          timestamp: Date.now(),
          isCorrect: isCorrect
        };

        if (isCorrect) {
          room.hints.push(`⚖️ تم الإجماع بنجاح! طابقت الشبهات المعطيات الجنائية وحلت القضية تماماً!`);
          const hasWitness = Object.values(room.players).some(p => p.role === 'Witness');
          if (room.isWitnessEnabled && hasWitness) {
            room.witnessAssassinationActive = true;
            room.hints.push(`🚨 ناقوس الخطر للشاهد الصامت! كشف المحققون تفاصيل الجريمة، للقاتل فرصة أخيرة لاغتيال الشاهد لسرقة الفوز!`);
          } else {
            room.status = 'Finished';
            io.to(roomId).emit('gameOver', { winners: 'Investigators', solution: room.solution });
          }
        } else {
          room.hints.push(`❌ تهور جماعي! الإجماع على اتهام ${proposal.targetName} بـ (${proposal.weapon}) و(${proposal.clue}) غير دقيق ومرفوض من النيابة.`);
          
          // Consume the vote for everyone who supported this failed proposal!
          proposal.votes.forEach(voterId => {
            const p = room.players[voterId];
            if (p) p.hasVoted = true;
          });

          // Check if all investigators have now voted / had their votes consumed
          const investigators = Object.values(room.players).filter(p => p.role === 'Investigator');
          const allVoted = investigators.every(p => p.hasVoted);
          if (allVoted) {
            room.status = 'Finished';
            io.to(roomId).emit('gameOver', { winners: 'Killer', solution: room.solution });
          }
        }

        // Clear proposals
        room.proposals = [];
      }
    }

    function handleBotActions(roomId: string) {
      const room = rooms[roomId];
      if (!room || room.status === 'Finished') return;

      // Handle Witness Assassination if Killer is bot
      if (room.witnessAssassinationActive) {
        const killerBot = Object.values(room.players).find(p => p.isBot && p.role === 'Killer');
        if (killerBot) {
          setTimeout(() => {
            if (!rooms[roomId] || !rooms[roomId].witnessAssassinationActive) return;
            const innocentPlayers = Object.values(room.players).filter(
              p => p.role !== 'Killer' && p.role !== 'Accomplice' && p.role !== 'Forensic'
            );
            if (innocentPlayers.length > 0) {
              const witness = innocentPlayers.find(p => p.role === 'Witness');
              // 50% chance of guessing correct witness if bot, otherwise random
              let target = innocentPlayers[Math.floor(Math.random() * innocentPlayers.length)];
              if (witness && Math.random() < 0.5) {
                target = witness;
              }
              
              const winStatus = target.role === 'Witness';
              room.witnessAssassinationActive = false;
              room.status = 'Finished';
              
              const witnessPlayer = Object.values(room.players).find(p => p.role === 'Witness');
              if (winStatus) {
                room.hints.push(`☠️ هروب جماعي للآلي! نجح القاتل الآلي في اغتيال الشاهد الصاعد (${target.name}) بنجاح وطمس الدليل للأبد!`);
                room.assassinationResult = { isCorrect: true, targetId: target.id, witnessId: witnessPlayer ? witnessPlayer.id : '' };
                io.to(roomId).emit('gameOver', { winners: 'Killer', solution: room.solution, assassinationResult: room.assassinationResult });
              } else {
                room.hints.push(`⚖️ خاب مسعى الآلي! فشل القاتل الآلي في تشخيص الشاهد، حيث اغتال المحقق البريء (${target.name}) بينما الشاهد بسلام!`);
                room.assassinationResult = { isCorrect: false, targetId: target.id, witnessId: witnessPlayer ? witnessPlayer.id : '' };
                io.to(roomId).emit('gameOver', { winners: 'Investigators', solution: room.solution, assassinationResult: room.assassinationResult });
              }
              io.to(roomId).emit('updateRoom', room);
            }
          }, 3000);
        }
        return;
      }

      if (room.status === 'Night') {
        const killerBot = Object.values(room.players).find(p => p.isBot && p.role === 'Killer');
        if (killerBot) {
          setTimeout(() => {
            if (!rooms[roomId] || rooms[roomId].status !== 'Night') return;
            const randomW = killerBot.weapons[Math.floor(Math.random() * killerBot.weapons.length)];
            const randomC = killerBot.clues[Math.floor(Math.random() * killerBot.clues.length)];
            
            room.solution = { weapon: randomW, clue: randomC, killerId: killerBot.id };
            room.status = 'Day';
            room.hints.push('🌅 بزغ فجر التحقيق! استيقظ المحققون وعثر على الجثة. تفحصوا اللوحات الجنائية بالأسفل.');

            // Draw forensic markers automatically if forensic is a bot too!
            const forensicBot = Object.values(room.players).find(p => p.isBot && p.role === 'Forensic');
            if (forensicBot) {
              room.tiles.forEach(tile => {
                let bestIndex = 0;
                tile.options.forEach((opt, idx) => {
                  if (opt.includes(randomW.substring(0, 3)) || opt.includes(randomC.substring(0, 3))) {
                    bestIndex = idx;
                  }
                });
                if (bestIndex === 0) {
                  bestIndex = Math.floor(Math.random() * tile.options.length);
                }
                tile.selectedIndex = bestIndex;
                room.hints.push(`📌 الطبيب الشرعي الآلي حدد: (${tile.name} ➔ ${tile.options[bestIndex]})`);
              });
            }

            io.to(roomId).emit('updateRoom', room);
            handleBotActions(roomId);
          }, 1500);
        }
      } else if (room.status === 'Day') {
        // If forensic is a bot, auto fill any unselected scene tile index
        const forensicBot = Object.values(room.players).find(p => p.isBot && p.role === 'Forensic');
        if (forensicBot) {
          let updated = false;
          room.tiles.forEach(tile => {
            if (tile.selectedIndex === null) {
              let bestIndex = 0;
              const solution = room.solution;
              if (solution) {
                tile.options.forEach((opt, idx) => {
                  if (opt.includes(solution.weapon.substring(0, 3)) || opt.includes(solution.clue.substring(0, 3))) {
                    bestIndex = idx;
                  }
                });
              }
              if (bestIndex === 0) {
                bestIndex = Math.floor(Math.random() * tile.options.length);
              }
              tile.selectedIndex = bestIndex;
              room.hints.push(`📌 الطبيب الشرعي الآلي حدد: (${tile.name} ➔ ${tile.options[bestIndex]})`);
              updated = true;
            }
          });
          if (updated) {
            io.to(roomId).emit('updateRoom', room);
          }
        }

        // Handle bot investigator voting/proposing one by one with simulated delay
        const botInvestigators = Object.values(room.players).filter(
          p => p.isBot && p.role === 'Investigator' && !p.hasVoted && 
          (!room.proposals || !room.proposals.some(prop => prop.votes.includes(p.id)))
        );
        if (botInvestigators.length > 0) {
          const bot = botInvestigators[0];
          setTimeout(() => {
            if (!rooms[roomId] || rooms[roomId].status !== 'Day') return;
            
            if (bot.hasVoted) return;
            if (rooms[roomId].proposals?.some(p => p.votes.includes(bot.id))) return;

            const suspects = Object.values(room.players).filter(p => p.role !== 'Forensic' && p.id !== bot.id);
            if (suspects.length > 0) {
              // 30% chance of guessing correct killer, otherwise random
              let target = suspects[Math.floor(Math.random() * suspects.length)];
              const killer = Object.values(room.players).find(p => p.role === 'Killer');
              if (killer && Math.random() < 0.3) {
                target = killer;
              }

              const targetW = target.weapons[Math.floor(Math.random() * target.weapons.length)] || '';
              const targetC = target.clues[Math.floor(Math.random() * target.clues.length)] || '';

              if (!room.proposals) room.proposals = [];

              const matchingProp = room.proposals.find(p => p.targetId === target.id);
              
              if (matchingProp && Math.random() < 0.6) {
                room.proposals.forEach(prop => {
                  prop.votes = prop.votes.filter(id => id !== bot.id);
                });
                matchingProp.votes.push(bot.id);
                room.hints.push(`💬 ${bot.name} يؤيد اتهام المشتبه به ${target.name} بـ (${matchingProp.weapon}) و (${matchingProp.clue})!`);
                checkAndExecuteProposal(roomId, matchingProp.id);
              } else {
                const identicalProp = room.proposals.find(p => p.targetId === target.id && p.weapon === targetW && p.clue === targetC);
                if (identicalProp) {
                  room.proposals.forEach(prop => {
                    prop.votes = prop.votes.filter(id => id !== bot.id);
                  });
                  identicalProp.votes.push(bot.id);
                  room.hints.push(`💬 ${bot.name} انضم لتأييد نفس اتهام ${target.name}!`);
                  checkAndExecuteProposal(roomId, identicalProp.id);
                } else {
                  room.proposals.forEach(prop => {
                    prop.votes = prop.votes.filter(id => id !== bot.id);
                  });
                  const propId = `prop_${Math.random().toString(36).substring(2, 9)}`;
                  room.proposals.push({
                    id: propId,
                    proposerId: bot.id,
                    proposerName: bot.name,
                    targetId: target.id,
                    targetName: target.name,
                    weapon: targetW,
                    clue: targetC,
                    votes: [bot.id]
                  });
                  room.hints.push(`💬 ${bot.name} يقترح اتهاماً جديداً ضد ${target.name} بـ (${targetW}) و (${targetC}).`);
                  checkAndExecuteProposal(roomId, propId);
                }
              }

              room.proposals = room.proposals.filter(p => p.votes.length > 0);

              io.to(roomId).emit('updateRoom', room);
              handleBotActions(roomId);
            }
          }, 3000 + Math.random() * 4000);
        }
      }
    }

    socket.on('startGame', ({ roomId, isAccompliceEnabled, isWitnessEnabled }) => {
      const room = rooms[roomId];
      if (!room) return;

      room.isAccompliceEnabled = isAccompliceEnabled;
      room.isWitnessEnabled = isWitnessEnabled;
      room.lastVote = null;
      room.proposals = [];
      room.round = 1;
      room.replacesLeft = 2;
      room.witnessAssassinationActive = false;
      room.assassinationResult = null;
      room.hints = [];

      // Draw active scene plates
      const chosenLocation = LOCATION_TILES[Math.floor(Math.random() * LOCATION_TILES.length)];
      const locationTileInRoom: SceneTile = JSON.parse(JSON.stringify(chosenLocation));
      const causeTileInRoom: SceneTile = JSON.parse(JSON.stringify(DEATHTILE));

      const sceneTilesDeck: SceneTile[] = JSON.parse(JSON.stringify(SCENE_TILES_DECK_PRESET));
      const shuffledSceneDeck = shuffle(sceneTilesDeck);
      const chosenSceneTiles = shuffledSceneDeck.slice(0, 4);
      const remainingSceneDeck = shuffledSceneDeck.slice(4);

      room.tiles = [causeTileInRoom, locationTileInRoom, ...chosenSceneTiles];
      room.tilesDeck = remainingSceneDeck;

      const playerIds = Object.keys(room.players);
      const n = playerIds.length;

      // Assign Roles
      let roles: Player['role'][] = ['Forensic', 'Killer'];
      if (room.isAccompliceEnabled && n >= 4) {
        roles.push('Accomplice');
      }
      if (room.isWitnessEnabled && n >= (room.isAccompliceEnabled ? 5 : 4)) {
        roles.push('Witness');
      }
      while (roles.length < n) {
        roles.push('Investigator');
      }

      const shuffledRoles = shuffle(roles);
      const shuffledWeapons = shuffle(WEAPONS);
      const shuffledClues = shuffle(CLUES);

      let weaponIndex = 0;
      let clueIndex = 0;

      playerIds.forEach((id, index) => {
        const player = room.players[id];
        player.role = shuffledRoles[index] as Player['role'];
        player.hasVoted = false;

        if (player.role !== 'Forensic') {
          // Robust wrap-around fallback to ensure players always receive exactly 4 weapons and 4 clues
          let wSlice = shuffledWeapons.slice(weaponIndex, weaponIndex + 4);
          if (wSlice.length < 4) {
            const extraCount = 4 - wSlice.length;
            wSlice = [...wSlice, ...shuffledWeapons.slice(0, extraCount)];
          }
          let cSlice = shuffledClues.slice(clueIndex, clueIndex + 4);
          if (cSlice.length < 4) {
            const extraCount = 4 - cSlice.length;
            cSlice = [...cSlice, ...shuffledClues.slice(0, extraCount)];
          }
          player.weapons = wSlice;
          player.clues = cSlice;
          weaponIndex += 4;
          clueIndex += 4;
        } else {
          player.weapons = [];
          player.clues = [];
        }
      });

      room.status = 'Night';
      io.to(roomId).emit('updateRoom', room);

      // Trigger AI actions
      handleBotActions(roomId);
    });

    socket.on('restartRoom', (roomId) => {
      const room = rooms[roomId];
      if (!room) return;
      
      room.status = 'Lobby';
      room.solution = null;
      room.hints = [];
      room.lastVote = null;
      room.proposals = [];
      room.tiles = [];
      room.tilesDeck = [];
      room.round = 1;
      room.replacesLeft = 2;
      room.witnessAssassinationActive = false;
      room.assassinationResult = null;
      
      Object.keys(room.players).forEach(id => {
        const player = room.players[id];
        player.role = null;
        player.weapons = [];
        player.clues = [];
        player.hasVoted = false;
      });

      io.to(roomId).emit('updateRoom', room);
    });

    socket.on('killerSelect', ({ roomId, weapon, clue }) => {
      const room = rooms[roomId];
      if (!room) return;
      const player = room.players[socket.id];
      if (player?.role === 'Killer') {
        room.solution = { weapon, clue, killerId: socket.id };
        room.status = 'Day'; // Transition to Day where forensic gives hints and investigators vote
        io.to(roomId).emit('updateRoom', room);

        // Trigger bot updates in day phase
        handleBotActions(roomId);
      }
    });

    socket.on('forensicHint', ({ roomId, hint }) => {
      const room = rooms[roomId];
      if (!room) return;
      const player = room.players[socket.id];
      if (player?.role === 'Forensic') {
        room.hints.push(hint);
        io.to(roomId).emit('updateRoom', room);
      }
    });

    socket.on('placeBullet', ({ roomId, tileId, optionIndex }) => {
      const room = rooms[roomId];
      if (!room) return;
      const player = room.players[socket.id];
      if (player?.role === 'Forensic') {
        const tile = room.tiles.find(t => t.id === tileId);
        if (tile) {
          tile.selectedIndex = optionIndex;
          const optionText = tile.options[optionIndex];
          room.hints.push(`📌 الطبيب الشرعي ثبّت مؤشر مسرح الجريمة: [${tile.name}] ➔ {${optionText}}`);
          io.to(roomId).emit('updateRoom', room);
        }
      }
    });

    socket.on('replaceTile', ({ roomId, tileId }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'Day') return;
      const player = room.players[socket.id];
      if (player?.role === 'Forensic' && room.replacesLeft > 0) {
        const tileIndex = room.tiles.findIndex(t => t.id === tileId && t.type === 'Scene');
        if (tileIndex !== -1 && room.tilesDeck.length > 0) {
          const oldTile = room.tiles[tileIndex];
          const newTile = room.tilesDeck.shift();
          if (newTile) {
            room.tiles[tileIndex] = newTile;
            room.replacesLeft--;
            room.hints.push(`🔄 الطبيب الشرعي تخلص من لوحة الجريمة [${oldTile.name}] واستبدلها بلوحة جديدة: [${newTile.name}]!`);
            io.to(roomId).emit('updateRoom', room);
          }
        }
      }
    });

    socket.on('nextRound', (roomId) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'Day') return;
      const player = room.players[socket.id];
      if (player?.role === 'Forensic') {
        if (room.round < 3) {
          room.round++;
          room.hints.push(`📣 بدأت جولة التحقيق رقم [${room.round}]! تمعنوا في القرائن المستحدثة وواصلوا النقاش.`);
          io.to(roomId).emit('updateRoom', room);
        }
      }
    });

    socket.on('assassinateWitness', ({ roomId, targetId }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'Day' || !room.witnessAssassinationActive) return;
      const player = room.players[socket.id];
      if (player?.role !== 'Killer') return;
      
      const target = room.players[targetId];
      if (!target) return;
      
      const witnessPlayer = Object.values(room.players).find(p => p.role === 'Witness');
      const winStatus = target.role === 'Witness';
      
      room.witnessAssassinationActive = false;
      room.status = 'Finished';
      
      if (winStatus) {
        room.hints.push(`☠️ اغتيال ناجح! نجح القاتل في رصد واستهداف الشاهد الصامت (${target.name}) بنجاح وهرب بجريمته! القاتل يفوز.`);
        room.assassinationResult = { isCorrect: true, targetId, witnessId: witnessPlayer ? witnessPlayer.id : '' };
        io.to(roomId).emit('gameOver', { winners: 'Killer', solution: room.solution, assassinationResult: room.assassinationResult });
      } else {
        room.hints.push(`⚖️ خاب السهم! فشل القاتل في معرفة هوية الشاهد الصامت، واغتصب حياة البريء (${target.name}) بينما الشاهد بأمان! المحققون يفوزون بالكامل.`);
        room.assassinationResult = { isCorrect: false, targetId, witnessId: witnessPlayer ? witnessPlayer.id : '' };
        io.to(roomId).emit('gameOver', { winners: 'Investigators', solution: room.solution, assassinationResult: room.assassinationResult });
      }
      
      io.to(roomId).emit('updateRoom', room);
    });

    socket.on('forensicConsumeVoteClue', ({ roomId, targetId, hint }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'Day') return;

      const player = room.players[socket.id];
      if (player?.role !== 'Forensic') return;

      const target = room.players[targetId];
      if (!target || target.role !== 'Investigator' || target.hasVoted) return;

      // Consume target investigator's vote
      target.hasVoted = true;

      // Withdraw their vote from any active proposals
      if (room.proposals) {
        room.proposals.forEach(prop => {
          prop.votes = prop.votes.filter(id => id !== targetId);
        });
        room.proposals = room.proposals.filter(prop => prop.votes.length > 0);
      }

      // Add the formatted hint to the room hints
      const formattedHint = `💡 تلميح استثنائي (مقابل استهلاك صوت المحقق ${target.name}): ${hint}`;
      room.hints.push(formattedHint);

      // Check if all investigators have now voted / had their votes consumed
      const investigators = Object.values(room.players).filter(p => p.role === 'Investigator');
      const allVoted = investigators.every(p => p.hasVoted);
      if (allVoted) {
        room.status = 'Finished';
        io.to(roomId).emit('gameOver', { winners: 'Killer', solution: room.solution });
      }

      io.to(roomId).emit('updateRoom', room);

      // Allow remaining bots to act if possible
      handleBotActions(roomId);
    });

    socket.on('submitAccusationProposal', ({ roomId, targetId, weapon, clue }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'Day') return;
      const player = room.players[socket.id];
      if (!player || player.role !== 'Investigator' || player.hasVoted) return;

      if (!room.proposals) room.proposals = [];

      // Remove player's vote from any existing proposals
      room.proposals.forEach(prop => {
        prop.votes = prop.votes.filter(id => id !== socket.id);
      });

      // Check if identical proposal already exists
      const target = room.players[targetId];
      const targetName = target ? target.name : 'مجهول';
      let existingProp = room.proposals.find(p => p.targetId === targetId && p.weapon === weapon && p.clue === clue);

      if (existingProp) {
        existingProp.votes.push(socket.id);
        room.hints.push(`💬 ${player.name} انضم لتأييد الاتهام ضد ${targetName}!`);
      } else {
        const propId = `prop_${Math.random().toString(36).substring(2, 9)}`;
        existingProp = {
          id: propId,
          proposerId: socket.id,
          proposerName: player.name,
          targetId: targetId,
          targetName: targetName,
          weapon,
          clue,
          votes: [socket.id]
        };
        room.proposals.push(existingProp);
        room.hints.push(`💬 ${player.name} يقترح رسمياً إدانة ${targetName} بـ (${weapon}) و (${clue}).`);
      }

      // Clean up empty proposals
      room.proposals = room.proposals.filter(prop => prop.votes.length > 0);

      checkAndExecuteProposal(roomId, existingProp.id);

      io.to(roomId).emit('updateRoom', room);
      handleBotActions(roomId);
    });

    socket.on('supportAccusationProposal', ({ roomId, proposalId }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'Day' || !room.proposals) return;
      const player = room.players[socket.id];
      if (!player || player.role !== 'Investigator' || player.hasVoted) return;

      const targetProp = room.proposals.find(p => p.id === proposalId);
      if (!targetProp) return;

      // Remove voter from other proposals
      room.proposals.forEach(prop => {
        prop.votes = prop.votes.filter(id => id !== socket.id);
      });

      // Add vote to target proposal
      targetProp.votes.push(socket.id);

      // Clean up empty proposals
      room.proposals = room.proposals.filter(prop => prop.votes.length > 0);

      room.hints.push(`💬 ${player.name} يدعم الاتهام المشترك ضد ${targetProp.targetName}!`);

      checkAndExecuteProposal(roomId, proposalId);

      io.to(roomId).emit('updateRoom', room);
      handleBotActions(roomId);
    });
    
    socket.on('disconnect', () => {
      for (const roomId in rooms) {
        if (rooms[roomId].players[socket.id]) {
          delete rooms[roomId].players[socket.id];
          if (Object.keys(rooms[roomId].players).length === 0) {
            delete rooms[roomId]; // Cleanup empty rooms
          } else {
            io.to(roomId).emit('updateRoom', rooms[roomId]);
          }
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
