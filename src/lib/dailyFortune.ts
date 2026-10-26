import { DEFAULT_TIME_ZONE } from "@/lib/timeZone";

/**
 * "Sorte do dia" do perfil (como a do Orkut), com o tema do Anime Hub. As frases são do próprio Anime Hub (nenhuma é
 * citação de obra). A frase muda a cada dia e é a mesma o dia inteiro para a mesma pessoa; pessoas diferentes podem
 * receber frases diferentes no mesmo dia.
 */
export const FORTUNES = [
  "Hoje o episódio novo sai na hora certa. Aproveite sem spoiler.",
  "Uma temporada esquecida na sua lista está esperando por você.",
  "Alguém vai te recomendar o anime certo na hora certa.",
  "Dia bom para maratonar sem culpa.",
  "O próximo arco vai valer cada episódio de preparação.",
  "Responda aquele tópico: a comunidade está esperando a sua teoria.",
  "Seu personagem favorito ganha destaque esta semana.",
  "Paciência: o melhor episódio da temporada ainda não chegou.",
  "Hoje é um ótimo dia para dar uma chance a um gênero novo.",
  "Termine o que começou: o final vale a pena.",
  "Uma abertura nova vai grudar na sua cabeça.",
  "Você vai achar alguém que curte o mesmo anime obscuro que você.",
  "Cuidado com os spoilers na timeline hoje.",
  "Um filme da franquia vai te surpreender.",
  "O seu protagonista interior está no meio de um treino. Continue.",
  "Deixe um recado para um amigo: ele vai gostar.",
  "A estreia que você espera está mais perto do que parece.",
  "Hoje vale rever o primeiro episódio daquele clássico.",
  "Seu próximo anime favorito está na aba Explorar.",
  "Tire um tempo para a trilha sonora: ela conta a história também.",
  "Um episódio filler pode esconder a melhor cena da semana.",
  "Escreva um depoimento: palavras gentis são poder de verdade.",
  "Organize a sua lista: o futuro você agradece.",
  "Hoje a sorte está do lado de quem vê legendado com calma.",
  "A comunidade do seu anime ganhou um evento novo. Dê uma olhada.",
  "O plot twist vem quando você menos espera.",
  "Dia de recomendar, não de spoilar.",
  "Seu título de quiz está esperando: 10 de 10 é possível.",
  "Uma conversa boa começa com uma enquete divertida.",
  "Volte àquela obra que você adiou. Agora é a hora.",
] as const;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A frase do dia (no fuso de quem vê) para a pessoa do perfil. */
export function dailyFortune(userId: string, now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  return FORTUNES[hash(`${userId}:${day}`) % FORTUNES.length];
}
