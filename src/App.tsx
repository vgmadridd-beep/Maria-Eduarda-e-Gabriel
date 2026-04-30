import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp,
  setDoc,
  deleteField,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from './firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gift, 
  MessageSquare, 
  Lock, 
  CheckCircle2, 
  ChevronRight, 
  X,
  ShieldCheck,
  Send,
  Trash2
} from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from './lib/utils';

// --- Types ---
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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface GiftItem {
  id: string;
  number: number;
  name: string;
  description: string;
  priceRange: string;
  status: 'available' | 'reserved';
  reservedBy?: string;
}

interface GuestMessage {
  id: string;
  senderName: string;
  content: string;
  createdAt: any;
}

// --- Icons ---
const TulipIcon = ({ className }: { className?: string }) => (
  <img 
    src="https://i.imgur.com/dP46MF3.png" 
    alt="Tulipas" 
    className={`${className} object-contain`}
    referrerPolicy="no-referrer"
  />
);

// --- Initial Data ---
const INITIAL_GIFTS = [
  { number: 1, name: "Jogo de Jantar 42 Peças", description: "Porcelana branca sofisticada", priceRange: "R$ 400 - R$ 600", status: "available" },
  { number: 2, name: "Air Fryer 4L", description: "Para as receitas saudáveis do casal", priceRange: "R$ 350 - R$ 500", status: "available" },
  { number: 3, name: "Conjunto de Panelas", description: "Indução, antiaderente premium", priceRange: "R$ 600 - R$ 900", status: "available" },
  { number: 4, name: "Liquidificador Digital", description: "Alta potência e design moderno", priceRange: "R$ 250 - R$ 400", status: "available" },
  { number: 5, name: "Aparelho de Fondue", description: "Para noites românticas de inverno", priceRange: "R$ 150 - R$ 300", status: "available" },
  { number: 6, name: "Robô Aspirador", description: "O melhor amigo da limpeza", priceRange: "R$ 800 - R$ 1200", status: "available" },
  { number: 7, name: "Jogo de Toalhas Banho", description: "Algodão egípcio, toque macio", priceRange: "R$ 200 - R$ 350", status: "available" },
  { number: 8, name: "Máquina de Café", description: "Espresso e cápsulas para os noivos", priceRange: "R$ 500 - R$ 800", status: "available" },
  { number: 9, name: "Kit para Churrasco", description: "Maleta com 18 peças aço inox", priceRange: "R$ 180 - R$ 300", status: "available" },
  { number: 10, name: "Edredom King Size", description: "Toque de seda para o novo lar", priceRange: "R$ 300 - R$ 500", status: "available" },
];

export default function App() {
  if (!db || !auth) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center p-6 text-center">
        <div className="bg-white p-10 rounded-3xl border border-[#E8E2D8] shadow-xl max-w-lg">
          <ShieldCheck className="w-12 h-12 text-[#5C6041] mx-auto mb-6 opacity-30" />
          <h1 className="text-2xl font-serif text-[#5C6041] mb-4">Configuração Pendente</h1>
          <p className="text-[#4A4238] mb-8 leading-relaxed">
            As credenciais do Firebase não foram detectadas. Se você estiver na Vercel, certifique-se de adicionar as <b>Environment Variables</b> no seu projeto (VITE_FIREBASE_API_KEY, etc).
          </p>
        </div>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<'rsvp' | 'gifts' | 'messages'>('rsvp');
  const [showWelcome, setShowWelcome] = useState(true);
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [rsvpList, setRsvpList] = useState<any[]>([]);
  const [isMadrinhaMode, setIsMadrinhaMode] = useState(false);
  const [isNoivaMode, setIsNoivaMode] = useState(false);
  const [madrinhaPassword, setMadrinhaPassword] = useState('');
  const [noivaPassword, setNoivaPassword] = useState('');
  const [showMadrinhaModal, setShowMadrinhaModal] = useState(false);
  const [showNoivaModal, setShowNoivaModal] = useState(false);
  const [selectedGift, setSelectedGift] = useState<GiftItem | null>(null);
  const [reservationName, setReservationName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // RSVP State
  const [rsvpData, setRsvpData] = useState({
    names: [''],
    confirmed: true
  });

  const addGuestName = () => {
    setRsvpData(prev => ({ ...prev, names: [...prev.names, ''] }));
  };

  const removeGuestName = (index: number) => {
    if (rsvpData.names.length <= 1) return;
    setRsvpData(prev => ({ 
      ...prev, 
      names: prev.names.filter((_, i) => i !== index) 
    }));
  };

  const updateGuestName = (index: number, value: string) => {
    const newNames = [...rsvpData.names];
    newNames[index] = value;
    setRsvpData(prev => ({ ...prev, names: newNames }));
  };

  // Auth: Anonymous Sign-in (Optional since reads are now public)
  useEffect(() => {
    signInAnonymously(auth).catch(err => {
      console.warn("Auth (Optional) error:", err.message);
    });
  }, []);

  // Sync Gifts from Firestore
  useEffect(() => {
    const q = query(collection(db, 'gifts'), orderBy('number', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        INITIAL_GIFTS.forEach(async (g) => {
          try {
             await setDoc(doc(db, 'gifts', `gift-${g.number}`), g);
          } catch (e) {
            console.error("Initial data sync error:", e);
          }
        });
      } else {
        const giftData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GiftItem));
        setGifts(giftData);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'gifts');
    });
    return unsubscribe;
  }, []);

  // Sync Messages from Firestore
  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messageData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GuestMessage));
      setMessages(messageData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'messages');
    });
    return unsubscribe;
  }, []);

  // Sync RSVP from Firestore
  useEffect(() => {
    if (!isNoivaMode && !isMadrinhaMode) {
      setRsvpList([]);
      return;
    }
    
    const q = query(collection(db, 'rsvp'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rsvpData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRsvpList(rsvpData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'rsvp');
    });
    return unsubscribe;
  }, [isNoivaMode, isMadrinhaMode]);

  // Prepare flattened list for display
  const flatRsvpList = useMemo(() => {
    return rsvpList.flatMap(rsvp => {
      const names = Array.isArray(rsvp.names) ? rsvp.names : [rsvp.name || ''];
      return names.map((name, i) => ({
        ...rsvp,
        displayName: name,
        flatId: `${rsvp.id}-${i}`,
        isFirstInGroup: i === 0,
        groupSize: names.length
      }));
    });
  }, [rsvpList]);

  // Actions
  const handleReserve = async () => {
    if (!selectedGift || !reservationName.trim()) return;
    setIsSubmitting(true);
    const giftPath = `gifts/${selectedGift.id}`;
    try {
      await updateDoc(doc(db, 'gifts', selectedGift.id), {
        status: 'reserved',
        reservedBy: reservationName.trim(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Presente reservado com sucesso!");
      setSelectedGift(null);
      setReservationName('');
    } catch (error) {
      toast.error("Erro ao reservar presente.");
      handleFirestoreError(error, OperationType.WRITE, giftPath);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetGift = async (giftId: string) => {
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'gifts', giftId), {
        status: 'available',
        reservedBy: deleteField(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Presente disponível novamente!");
    } catch (error) {
      toast.error("Erro ao atualizar presente.");
      handleFirestoreError(error, OperationType.WRITE, `gifts/${giftId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRsvp = async (id: string) => {
    console.log("Delete attempt for ID:", id);
    if (!id) return;
    
    const deletePromise = deleteDoc(doc(db, 'rsvp', id));
    
    toast.promise(deletePromise, {
      loading: 'Removendo...',
      success: 'Removido com sucesso!',
      error: (err) => `Erro ao remover: ${err.message || 'Verifique as permissões'}`
    });

    try {
      await deletePromise;
      console.log("Delete successful for ID:", id);
    } catch (error) {
      console.error("Delete failed for ID:", id, error);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    if (!id) return;
    
    const deletePromise = deleteDoc(doc(db, 'messages', id));
    
    toast.promise(deletePromise, {
      loading: 'Removendo recado...',
      success: 'Recado removido!',
      error: 'Erro ao remover recado.'
    });

    try {
      await deletePromise;
    } catch (error: any) {
      console.error("Erro ao excluir mensagem:", error);
      handleFirestoreError(error, OperationType.DELETE, `messages/${id}`);
    }
  };

  const handleClearMessages = async () => {
    // We'll keep a simple confirmation for clearing everything but we should be aware it might fail in some iFrame environments
    // Given the request, we will make it direct but with a loading state
    const loadingToast = toast.loading("Limpando mural...");
    try {
      const q = query(collection(db, 'messages'));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      toast.success("Mural limpo com sucesso!", { id: loadingToast });
    } catch (error: any) {
      console.error("Erro ao limpar mural:", error);
      toast.error("Erro ao limpar mural.", { id: loadingToast });
    }
  };

  const handlePostMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const senderName = formData.get('senderName') as string;
    const content = formData.get('content') as string;

    if (!senderName.trim() || !content.trim()) return;

    setIsSubmitting(true);
    const msgPath = 'messages';
    try {
      await addDoc(collection(db, msgPath), {
        senderName,
        content,
        createdAt: serverTimestamp(),
      });
      toast.success("Mensagem enviada com carinho!");
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      toast.error("Erro ao enviar mensagem.");
      handleFirestoreError(error, OperationType.WRITE, msgPath);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!rsvpData.confirmed) {
      toast.error("Por favor, confirme sua presença.");
      return;
    }
    const filledNames = rsvpData.names.filter(n => n.trim() !== '');
    if (filledNames.length === 0) {
      toast.error("Por favor, preencha pelo menos um nome.");
      return;
    }
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'rsvp'), {
        names: filledNames,
        confirmed: rsvpData.confirmed,
        count: filledNames.length,
        createdAt: serverTimestamp()
      });
      toast.success("Presença confirmada!");
      setRsvpData({ names: [''], confirmed: true });
    } catch (error) {
      toast.error("Erro ao confirmar presença.");
      handleFirestoreError(error, OperationType.WRITE, 'rsvp');
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkMadrinhaPassword = () => {
    if (madrinhaPassword === 'madrinhavirginia2026') {
      setIsMadrinhaMode(true);
      setShowMadrinhaModal(false);
      toast.success("Acesso autorizado!");
    } else {
      toast.error("Senha incorreta.");
    }
  };

  const checkNoivaPassword = () => {
    if (noivaPassword === 'noivamariae2026') {
      setIsNoivaMode(true);
      setShowNoivaModal(false);
      toast.success("Bem-vinda, Maria Eduarda!");
    } else {
      toast.error("Senha incorreta.");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] selection:bg-[#5C6041]/30">
      <Toaster position="bottom-center" />
      
      {/* Welcome Screen Overlay */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="fixed inset-0 z-[100] bg-[#FAF8F5] flex items-start md:items-center justify-center p-4 md:p-6 text-center overflow-y-auto"
          >
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="max-w-3xl mx-auto py-8 space-y-8 text-center flex flex-col items-center"
            >
                <div className="flex justify-center mb-4">
                  <TulipIcon className="h-32 md:h-40 w-auto" />
                </div>
              
              <div className="text-[#4A4238] leading-relaxed font-serif italic text-base md:text-lg space-y-6 w-full flex flex-col items-center">
                <p className="font-[Georgia] text-xl md:text-3xl text-[#5C6041] not-italic leading-tight text-center max-w-4xl font-normal px-4">
                  Sejam bem-vindos à <span className="font-normal block sm:inline">Confirmação de Presença e Lista de Presentes</span>
                </p>
                <div className="space-y-4 text-base md:text-lg w-full flex flex-col items-center px-4">
                  <p className="text-[#5C6041] max-w-[700px] mx-auto text-center">
                    É uma alegria ter você aqui! <br className="hidden sm:block"/>
                    Este site foi criado para a melhor organização do grande dia de Maria Eduarda e Gabriel e para que cada convidado possa oferecer um presente único e especial para os noivos.
                  </p>
                  
                  <div className="bg-[#FAF8F5] p-6 rounded-xl border border-[#5C6041]/10 space-y-3 max-w-[700px] mx-auto text-center shadow-sm">
                    <p className="font-medium text-[#5C6041] not-italic uppercase tracking-widest text-[10px]">
                      Passo a Passo:
                    </p>
                    <p className="text-sm md:text-base text-[#5C6041] not-italic leading-relaxed max-w-[600px] mx-auto">
                      1. Primeiro, <span className="font-bold">confirme sua presença</span> na aba correspondente.<br/>
                      2. Depois, escolha um presente na lista. <span className="font-bold text-[#5C6041]">Por favor, selecione o presente aqui no site antes de comprar</span> — assim evitamos presentes repetidos.<br/>
                      3. Ao final, sinta-se à vontade para deixar um recado.
                    </p>
                  </div>
                  <p className="text-[10px] md:text-sm text-[#93a481] italic max-w-[551px] mx-auto text-center opacity-80">
                    * Caso você tenha pensado em algo especial que não esteja na lista, não tem problema! Sinta-se à vontade para presentear como seu coração desejar.
                  </p>
                </div>
              </div>

              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowWelcome(false);
                  setActiveTab('rsvp');
                }}
                className="mt-4 mb-4 px-8 md:px-12 py-3 md:py-4 bg-[#5C6041] text-white rounded-full font-medium tracking-widest uppercase text-[10px] md:text-xs shadow-xl shadow-[#5C6041]/20 hover:opacity-90 transition-all"
              >
                Prosseguir para Confirmação
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Header Section */}
      <header className="relative min-h-[400px] md:h-[60vh] flex flex-col items-center justify-center text-center overflow-hidden">
        <div className="absolute inset-0 bg-black/5 z-0" />
        <img 
          src="https://picsum.photos/seed/wedding-luxury/1920/1080?blur=2" 
          className="absolute inset-0 w-full h-full object-cover -z-10 opacity-40"
          alt="Wedding Header"
          referrerPolicy="no-referrer"
        />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="z-10 p-6 md:p-8 flex flex-col items-center"
        >
          <div className="mb-6">
            <TulipIcon className="h-20 md:h-28 w-auto" />
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-8xl font-accent italic text-[#5C6041] mb-4 md:mb-6 tracking-tight leading-tight md:leading-none px-4">
            Maria Eduarda & Gabriel
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 text-[#5C6041] uppercase tracking-[0.15em] md:tracking-[0.3em] font-light text-[10px] md:text-base px-4">
            <div className="hidden sm:block h-px w-4 md:w-8 bg-[#5C6041]/30" />
            <span>1 de Agosto de 2026</span>
            <div className="hidden sm:block h-px w-4 md:w-8 bg-[#5C6041]/30" />
          </div>
          <p className="mt-6 md:mt-8 font-serif italic text-sm md:text-lg text-[#93a481] max-w-2xl mx-auto px-6 leading-relaxed">
            "²⁴ Por essa razão, o homem deixará pai e mãe e se unirá à sua mulher, e eles se tornarão uma só carne."
            <span className="block mt-2 text-[9px] md:text-xs uppercase tracking-widest font-sans not-italic font-bold">Gênesis 2:24</span>
          </p>
        </motion.div>
      </header>

      {/* Navigation Tabs */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-[#E8E2D8] shadow-sm">
        <div className="max-w-4xl mx-auto relative px-4 md:px-0 flex items-center justify-center">
          <div className="flex overflow-x-auto no-scrollbar scroll-smooth items-center">
            <button 
              onClick={() => setActiveTab('rsvp')}
              className={cn(
                "flex items-center gap-2 px-4 md:px-8 py-3 md:py-4 text-[10px] md:text-sm font-medium tracking-wide transition-all border-b-2 whitespace-nowrap",
                activeTab === 'rsvp' ? "border-[#5C6041] text-[#5C6041]" : "border-transparent text-[#93a481] hover:text-[#5C6041]"
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Presença
            </button>
            <button 
              onClick={() => setActiveTab('gifts')}
              className={cn(
                "flex items-center gap-2 px-4 md:px-8 py-3 md:py-4 text-[10px] md:text-sm font-medium tracking-wide transition-all border-b-2 whitespace-nowrap",
                activeTab === 'gifts' ? "border-[#5C6041] text-[#5C6041]" : "border-transparent text-[#93a481] hover:text-[#5C6041]"
              )}
            >
              <Gift className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Lista
            </button>
            <button 
              onClick={() => setActiveTab('messages')}
              className={cn(
                "flex items-center gap-2 px-4 md:px-8 py-3 md:py-4 text-[10px] md:text-sm font-medium tracking-wide transition-all border-b-2 whitespace-nowrap",
                activeTab === 'messages' ? "border-[#5C6041] text-[#5C6041]" : "border-transparent text-[#93a481] hover:text-[#5C6041]"
              )}
            >
              <MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Mensagens
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto py-8 md:py-12 px-4 md:px-8">
        <AnimatePresence mode="wait">
          {activeTab === 'rsvp' ? (
            <motion.div 
              key="rsvp"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-xl mx-auto space-y-8 md:space-y-12"
            >
              <div className="text-center relative">
                <h2 className="text-2xl md:text-3xl font-serif text-[#5C6041] mb-2 md:mb-4 px-4">Confirmação de Presença</h2>
                <p className="text-[#93a481] text-[10px] md:text-sm px-6">Sua presença é essencial para completar nossa felicidade!</p>
              </div>

              <form onSubmit={handleRsvp} className="bg-white p-6 md:p-8 rounded-2xl border border-[#E8E2D8] shadow-sm space-y-6">
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#93a481] mb-2">Nomes Completos dos Convidados</label>
                    {rsvpData.names.map((name, index) => (
                      <div key={index} className="flex gap-2">
                        <input 
                          value={name}
                          onChange={e => updateGuestName(index, e.target.value)}
                          required
                          placeholder={index === 0 ? "Seu nome completo" : "Nome completo do acompanhante"}
                          className="flex-1 bg-[#FAF8F5] border border-[#5C6041]/20 px-4 py-3 rounded-md focus:outline-none focus:ring-1 focus:ring-[#5C6041] text-sm"
                        />
                        {rsvpData.names.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => removeGuestName(index)}
                            className="p-3 text-[#93a481] hover:text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    
                    <button 
                      type="button"
                      onClick={addGuestName}
                      className="text-[10px] uppercase tracking-widest text-[#5C6041] font-bold flex items-center gap-2 mt-2 hover:opacity-70 transition-opacity"
                    >
                      <span className="w-5 h-5 flex items-center justify-center rounded-full border border-[#5C6041] text-xs">+</span>
                      Adicionar outra pessoa
                    </button>
                  </div>
                </div>

                <button 
                  disabled={isSubmitting}
                  className="w-full bg-[#5C6041] text-white py-4 rounded-md text-sm font-bold uppercase tracking-[0.2em] hover:opacity-90 transition-all shadow-lg shadow-[#5C6041]/20 disabled:opacity-50"
                >
                  {isSubmitting ? "Enviando..." : "Enviar Confirmação"}
                </button>
                
                <p className="text-[10px] text-center text-[#93a481] italic">
                  * Por favor, confirme até dia 1 de julho de 2026.
                </p>
              </form>
            </motion.div>
          ) : activeTab === 'gifts' ? (
            <motion.div 
              key="gifts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="text-center max-w-2xl mx-auto mb-8 md:mb-16 flex flex-col items-center px-4">
                <motion.span 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="font-accent italic text-xl md:text-3xl text-[#5C6041] mb-1"
                >
                  Com carinho
                </motion.span>
                <motion.h2 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-3xl md:text-5xl font-serif font-medium text-[#5C6041] mb-4 md:mb-6 tracking-tight leading-none"
                >
                  Lista de Presentes
                </motion.h2>
                <motion.div 
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "100%" }}
                  transition={{ delay: 0.3, duration: 0.8 }}
                  className="flex items-center gap-4 w-full max-w-[240px] md:max-w-[320px]"
                >
                  <div className="h-[1px] flex-1 bg-[#5C6041]/30" />
                  <span className="text-[9px] md:text-[10px] font-sans tracking-[0.3em] md:tracking-[0.4em] uppercase text-[#5C6041] font-semibold whitespace-nowrap">Escolha o seu</span>
                  <div className="h-[1px] flex-1 bg-[#5C6041]/30" />
                </motion.div>

                <div className="mt-8 md:mt-12 bg-[#FAF8F5] p-3 rounded-lg border border-[#5C6041]/10 flex flex-col items-center justify-center gap-2 md:gap-3 max-w-md mx-auto">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 flex items-center justify-center rounded-full bg-[#5C6041]/60 text-white text-[8px] font-bold shrink-0">!</div>
                    <p className="text-[10px] italic text-[#4A4238]/70">
                      Apenas a madrinha terá acesso aos nomes de quem reservou cada presente.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {gifts.map((gift) => (
                  <motion.div
                    key={gift.id}
                    whileHover={{ y: -5 }}
                    className={cn(
                      "relative group bg-white border border-[#E8E2D8] p-6 rounded-xl shadow-sm transition-all overflow-hidden",
                      gift.status === 'reserved' && "opacity-60 grayscale-[0.5]"
                    )}
                  >
                    <div className="absolute top-0 right-0 p-4">
                      <span className="font-serif text-4xl text-[#5C6041]/10 font-bold">#{gift.number}</span>
                    </div>
                    {gift.status === 'reserved' && (
                      <div className="absolute top-3 right-3 bg-[#5C6041] text-white text-[10px] px-2 py-0.5 rounded-full z-10 font-bold uppercase tracking-widest">
                        RESERVADO
                      </div>
                    )}

                    <div className="mb-4">
                      <h3 className={cn(
                        "text-base md:text-lg font-serif text-[#5C6041] mb-1",
                        gift.status === 'reserved' && "line-through text-[#93a481]"
                      )}>
                        {gift.name}
                      </h3>
                      <p className="text-[11px] md:text-xs text-[#93a481] mb-4 h-10 leading-snug line-clamp-2">{gift.description}</p>
                      <div className="flex items-center justify-between mt-6">
                        <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-[#93a481]">
                          {gift.priceRange}
                        </span>
                        {gift.status !== 'reserved' && (
                          <button
                            onClick={() => setSelectedGift(gift)}
                            className="text-[10px] md:text-xs bg-[#FAF8F5] border border-[#5C6041]/40 px-3 md:px-4 py-1.5 md:py-2 rounded-full hover:bg-[#5C6041] hover:text-white transition-all font-medium"
                          >
                            Escolher
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="messages"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto space-y-12"
            >
              <div className="text-center relative">
                <h2 className="text-2xl md:text-3xl font-serif text-[#5C6041] mb-2 md:mb-4">Mensagens de Carinho</h2>
                <p className="text-[#93a481] text-[10px] md:text-sm px-6">Suas palavras são o nosso maior presente!</p>
                {isMadrinhaMode && messages.length > 0 && (
                  <button 
                    onClick={handleClearMessages}
                    className="mt-4 text-[10px] uppercase tracking-widest text-red-500 hover:text-red-700 font-bold border border-red-200 px-4 py-1.5 rounded-full bg-red-50 transition-all"
                  >
                    Limpar Todo o Mural
                  </button>
                )}
              </div>

              <form onSubmit={handlePostMessage} className="bg-white p-6 md:p-8 rounded-2xl border border-[#E8E2D8] shadow-sm max-w-xl mx-auto w-full">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#93a481] mb-2">Seu Nome</label>
                    <input 
                      name="senderName"
                      required
                      placeholder="Ex: João e Maria"
                      className="w-full bg-[#FAF8F5] border border-[#5C6041]/20 px-4 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-[#5C6041] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#93a481] mb-2">Sua Mensagem</label>
                    <textarea 
                      name="content"
                      required
                      placeholder="Escreva algo especial..."
                      rows={4}
                      className="w-full bg-[#FAF8F5] border border-[#5C6041]/20 px-4 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-[#5C6041] text-sm resize-none"
                    />
                  </div>
                  <button 
                    disabled={isSubmitting}
                    className="w-full bg-[#5C6041] text-white py-3 rounded-md flex items-center justify-center gap-2 text-sm font-medium hover:opacity-90 transition-all shadow-md disabled:opacity-50"
                  >
                    {isSubmitting ? "Enviando..." : "Enviar Mensagem"}
                  </button>
                </div>
              </form>

              <div className="space-y-4 max-w-xl mx-auto w-full">
                <h3 className="font-serif text-xl text-[#5C6041] border-b border-[#E8E2D8] pb-4">Mural dos Noivos</h3>
                {messages.length === 0 ? (
                  <p className="text-center text-xs text-[#93a481] italic py-8">Ainda não há mensagens. Seja o primeiro!</p>
                ) : (
                  messages.map((msg) => (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      key={msg.id} 
                      className="bg-white border-l-4 border-[#5C6041] p-5 rounded-r-lg shadow-sm relative group"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[#5C6041] text-xs font-bold mb-1">{msg.senderName}</p>
                          <p className="text-sm text-[#4A4238] italic">"{msg.content}"</p>
                        </div>
                        {isMadrinhaMode && (
                          <button 
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                            title="Apagar recado"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer & Madrinha Access */}
      <footer className="mt-20 py-20 bg-[#FAF8F5] flex flex-col items-center text-center">
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="space-y-6"
        >
          <p className="font-accent italic text-4xl md:text-5xl text-[#5C6041] leading-none">
            Maria Eduarda & Gabriel
          </p>
          <div className="flex flex-col items-center">
            <div className="flex flex-wrap justify-center gap-8 mb-12">
              <button 
                onClick={() => isNoivaMode ? setIsNoivaMode(true) : setShowNoivaModal(true)}
                className="text-[9px] uppercase tracking-[0.3em] text-[#93a481]/40 hover:text-[#5C6041] transition-all cursor-pointer"
              >
                Painel Noiva
              </button>
              <button 
                onClick={() => isMadrinhaMode ? setIsMadrinhaMode(true) : setShowMadrinhaModal(true)}
                className="text-[9px] uppercase tracking-[0.3em] text-[#93a481]/40 hover:text-[#5C6041] transition-all cursor-pointer"
              >
                Painel Madrinha
              </button>
            </div>

            <p className="text-[10px] md:text-xs font-sans tracking-[0.6em] uppercase text-[#4A4238]/40 font-medium">
              Com amor · 2026
            </p>
          </div>
        </motion.div>
      </footer>

      {/* --- Modals --- */}
      
      {/* Reservation Modal */}
      <AnimatePresence>
        {selectedGift && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedGift(null)}
              className="absolute inset-0 bg-[#5C6041]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl p-8 relative z-10 shadow-2xl border border-[#5C6041]"
            >
              <button 
                onClick={() => setSelectedGift(null)}
                className="absolute top-4 right-4 p-2 text-[#93a481] hover:text-[#5C6041]"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center mb-6">
                <h3 className="text-xl font-serif text-[#5C6041]">Reservar Presente</h3>
                <p className="text-sm text-[#93a481] mt-1 line-clamp-1">{selectedGift.name}</p>
              </div>

              <div className="space-y-4">
                <input 
                  value={reservationName}
                  onChange={(e) => setReservationName(e.target.value)}
                  placeholder="Seu Nome Completo"
                  className="w-full bg-[#FAF8F5] border border-[#5C6041]/30 px-4 py-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#5C6041] text-sm"
                />
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => setSelectedGift(null)}
                    className="flex-1 py-3 text-xs border border-[#E8E2D8] rounded-lg font-medium"
                  >
                    Cancelar
                  </button>
                  <button 
                    disabled={!reservationName.trim() || isSubmitting}
                    onClick={handleReserve}
                    className="flex-1 py-3 text-xs bg-[#5C6041] text-white rounded-lg font-bold shadow-md hover:opacity-90 disabled:opacity-50"
                  >
                    {isSubmitting ? "..." : "Confirmar"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Madrinha Login Modal */}
      <AnimatePresence>
        {showMadrinhaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMadrinhaModal(false)}
              className="absolute inset-0 bg-[#5C6041]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl p-8 relative z-10 shadow-2xl border border-[#5C6041]"
            >
              <button 
                onClick={() => setShowMadrinhaModal(false)}
                className="absolute top-4 right-4 p-2 text-[#93a481]"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center mb-6">
                <ShieldCheck className="w-10 h-10 text-[#5C6041] mx-auto mb-4" />
                <h3 className="text-xl font-serif text-[#5C6041]">Acesso da Madrinha</h3>
                <p className="text-xs text-[#93a481] mt-1">Senha exclusiva para controle de presentes.</p>
              </div>

              <div className="space-y-4">
                <input 
                  type="password"
                  value={madrinhaPassword}
                  onChange={(e) => setMadrinhaPassword(e.target.value)}
                  placeholder="Senha secreta"
                  className="w-full bg-[#FAF8F5] border border-[#5C6041]/30 px-4 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-[#5C6041] text-center text-sm"
                />
                <button 
                  onClick={checkMadrinhaPassword}
                  className="w-full bg-[#5C6041] text-white py-2 rounded-md text-sm font-medium hover:opacity-90 transition-all"
                >
                  Entrar no Painel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Noiva Login Modal */}
      <AnimatePresence>
        {showNoivaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoivaModal(false)}
              className="absolute inset-0 bg-[#5C6041]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl p-8 relative z-10 shadow-2xl border border-[#5C6041]"
            >
              <button 
                onClick={() => setShowNoivaModal(false)}
                className="absolute top-4 right-4 p-2 text-[#93a481]"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center mb-6">
                <Lock className="w-10 h-10 text-[#5C6041] mx-auto mb-4" />
                <h3 className="text-xl font-serif text-[#5C6041]">Acesso da Noiva</h3>
                <p className="text-xs text-[#93a481] mt-1">Olá Maria Eduarda! Digite sua senha.</p>
              </div>

              <div className="space-y-4">
                <input 
                  type="password"
                  value={noivaPassword}
                  onChange={(e) => setNoivaPassword(e.target.value)}
                  placeholder="Senha da noiva"
                  className="w-full bg-[#FAF8F5] border border-[#5C6041]/30 px-4 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-[#5C6041] text-center text-sm"
                />
                <button 
                  onClick={checkNoivaPassword}
                  className="w-full bg-[#5C6041] text-white py-2 rounded-md text-sm font-medium hover:opacity-90 transition-all"
                >
                  Ver Lista de Confirmados
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Noiva Data Panel (Redundant block removed) */}

      {/* Madrinha Data Panel */}
      <AnimatePresence>
        {isMadrinhaMode && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed inset-0 z-[60] bg-[#FDFCF8] overflow-y-auto"
          >
            <div className="max-w-5xl mx-auto p-6 md:py-12">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-serif text-[#5C6041]">Painel da Madrinha</h2>
                <button 
                  onClick={() => setIsMadrinhaMode(false)}
                  className="px-6 py-2 bg-[#5C6041] text-white text-[10px] font-bold uppercase tracking-widest rounded-full"
                >
                  Sair do Painel
                </button>
              </div>

              <div className="space-y-12">
                <section>
                  <h3 className="text-xl font-serif text-[#5C6041] mb-4 border-b border-[#E8E2D8] pb-2">Gestão de Presentes</h3>
                  <div className="bg-white border border-[#E8E2D8] rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[600px]">
                      <thead className="bg-[#F2EDE4] text-[#4A4238]">
                        <tr>
                          <th className="px-6 py-4 font-semibold w-16">Ref.</th>
                          <th className="px-6 py-4 font-semibold">Presente</th>
                          <th className="px-6 py-4 font-semibold">Status</th>
                          <th className="px-6 py-4 font-semibold">Convidado</th>
                          <th className="px-6 py-4 font-semibold text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E2D8]">
                        {gifts.map(gift => (
                          <tr key={gift.id} className="hover:bg-[#FAF8F5]">
                            <td className="px-6 py-4 text-[#5C6041] font-mono">#{gift.number}</td>
                            <td className="px-6 py-4 font-medium text-[#4A4238]">{gift.name}</td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "flex items-center gap-1.5 font-bold uppercase text-[10px] tracking-widest",
                                gift.status === 'reserved' ? "text-[#5C6041]" : "text-emerald-600"
                              )}>
                                <div className={cn("w-1.5 h-1.5 rounded-full", gift.status === 'reserved' ? "bg-[#5C6041]" : "bg-emerald-600")} />
                                {gift.status === 'reserved' ? 'Reservado' : 'Disponível'}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-medium">
                              {gift.reservedBy || "—"}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {gift.status === 'reserved' && (
                                <button 
                                  onClick={() => handleResetGift(gift.id)}
                                  disabled={isSubmitting}
                                  className="text-[10px] bg-red-50 text-red-600 px-3 py-1 rounded border border-red-100 hover:bg-red-100 transition-colors uppercase font-bold"
                                >
                                  Resetar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h3 className="text-xl font-serif text-[#5C6041] mb-4 border-b border-[#E8E2D8] pb-2">Lista de Convidados (RSVP)</h3>
                  <div className="bg-white border border-[#E8E2D8] rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[600px]">
                      <thead className="bg-[#F2EDE4] text-[#4A4238]">
                        <tr>
                          <th className="px-6 py-4 font-semibold w-12">#</th>
                          <th className="px-6 py-4 font-semibold">Nomes</th>
                          <th className="px-6 py-4 font-semibold">Qtd</th>
                          <th className="px-6 py-4 font-semibold text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E2D8]">
                        {flatRsvpList.map((rsvp, idx) => (
                          <tr key={rsvp.flatId} className="hover:bg-[#FAF8F5]">
                            <td className="px-6 py-4 text-[#93a481] font-mono text-xs">{idx + 1}</td>
                            <td className="px-6 py-4 font-medium text-[#4A4238] uppercase tracking-wide">
                              {rsvp.displayName}
                            </td>
                            <td className="px-6 py-4 text-[#93a481]">
                              {rsvp.isFirstInGroup ? (
                                <span className="text-[10px] bg-[#FAF8F5] px-2 py-0.5 rounded border border-[#5C6041]/20">
                                  GRUPO ({rsvp.groupSize})
                                </span>
                              ) : (
                                <span className="text-[10px] text-[#93a481]/50 italic">mesmo grupo</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {rsvp.isFirstInGroup && (
                                <button 
                                  onClick={() => handleDeleteRsvp(rsvp.id)}
                                  className="p-2 text-red-400 hover:text-red-600 rounded-full hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h3 className="text-xl font-serif text-[#5C6041] mb-4 border-b border-[#E8E2D8] pb-2">Gestão de Recados</h3>
                  <div className="bg-white border border-[#E8E2D8] rounded-xl overflow-hidden shadow-sm">
                    <div className="p-4 bg-[#F2EDE4] flex justify-between items-center">
                      <span className="text-xs font-bold text-[#4A4238] uppercase tracking-widest">{messages.length} Recados no Mural</span>
                      {messages.length > 0 && (
                        <button 
                          onClick={handleClearMessages}
                          className="text-[10px] bg-red-50 text-red-600 px-3 py-1 rounded border border-red-100 hover:bg-red-100 transition-colors uppercase font-bold"
                        >
                          Zerar Mural
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-[#E8E2D8] max-h-[400px] overflow-y-auto font-sans">
                      {messages.map((msg) => (
                        <div key={msg.id} className="p-4 hover:bg-[#FAF8F5] flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-[#5C6041] text-xs pb-0.5">{msg.senderName}</span>
                              <span className="text-[10px] text-[#93a481] font-mono">
                                {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'dd/MM/yy HH:mm') : '—'}
                              </span>
                            </div>
                            <p className="text-sm text-[#4A4238] italic">"{msg.content}"</p>
                          </div>
                          <button 
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-2 text-red-400 hover:text-red-600 rounded-full hover:bg-red-50 transition-all"
                            title="Apagar recado"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {messages.length === 0 && (
                        <div className="p-8 text-center text-[#93a481] italic text-sm">O mural está vazio.</div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Noiva Data Panel */}
      <AnimatePresence>
        {isNoivaMode && (
          <motion.div 
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="fixed inset-0 z-[60] bg-[#FDFCF8] overflow-y-auto"
          >
            <div className="max-w-4xl mx-auto p-6 md:py-12">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12">
                <div>
                  <h2 className="text-4xl font-serif text-[#5C6041] mb-2 text-center md:text-left">Lista de Confirmados</h2>
                  <p className="text-[#93a481] text-sm text-center md:text-left tracking-widest uppercase">Acompanhe seus convidados</p>
                </div>
                <div className="flex flex-wrap gap-4 justify-center md:justify-end">
                  <button 
                    onClick={() => setIsNoivaMode(false)}
                    className="px-8 py-3 bg-[#5C6041] text-white text-xs font-bold uppercase tracking-widest rounded-full shadow-lg hover:opacity-90 transition-all"
                  >
                    Sair do Painel
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] text-center">
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-[#93a481] mb-2">Total de Convidados</span>
                  <p className="text-3xl font-serif text-[#5C6041]">50</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] text-center">
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-[#93a481] mb-2">Confirmados</span>
                  <p className="text-3xl font-serif text-[#5C6041]">{rsvpList.reduce((acc, curr) => acc + curr.count, 0)}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] text-center">
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-[#93a481] mb-2">Porcentagem</span>
                  <p className="text-3xl font-serif text-[#5C6041]">
                    {Math.round((rsvpList.reduce((acc, curr) => acc + curr.count, 0) / 50) * 100)}%
                  </p>
                </div>
              </div>

              <div className="bg-white border border-[#E8E2D8] rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[500px]">
                  <thead className="bg-[#F2EDE4] text-[#4A4238]">
                    <tr>
                      <th className="px-6 py-4 font-semibold w-12">#</th>
                      <th className="px-6 py-4 font-semibold">Convidados Confirmados</th>
                      <th className="px-6 py-4 font-semibold">Data</th>
                      <th className="px-6 py-4 font-semibold text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D8]">
                    {flatRsvpList.map((rsvp, index) => (
                      <tr key={rsvp.flatId} className="hover:bg-[#FAF8F5]">
                        <td className="px-6 py-4 text-[#93a481] font-mono text-xs">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 font-medium text-[#5C6041] uppercase tracking-wide">
                          {rsvp.displayName}
                        </td>
                        <td className="px-6 py-4 text-[10px] text-[#93a481] uppercase">
                          {rsvp.createdAt?.toDate ? format(rsvp.createdAt.toDate(), 'dd/MM/yy HH:mm') : '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {rsvp.isFirstInGroup && (
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteRsvp(rsvp.id);
                              }}
                              className="p-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-full transition-all cursor-pointer flex items-center justify-center ml-auto relative z-[100]"
                              title="Excluir grupo"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rsvpList.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-[#93a481] italic">Nenhuma confirmação recebida ainda.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
