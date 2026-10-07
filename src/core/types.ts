export type Rarity = string;
export interface CardDefinition {
  id: string; name: string; set: string; setCode: string; number: string;
  rarity: Rarity; year: number; type: string; value: number; color: string;
  image?: string; imageSmall?: string; sourceUrl: string; category: string;
  hp?: number; artist?: string; stage?: string; attacks?: unknown[]; abilities?: unknown[];
  weaknesses?: unknown[]; resistances?: unknown[]; retreat?: number; releaseDate?: string;
  types?: string[]; suffix?: string; evolvesFrom?: string; regulationMark?: string;
  description?: string; effect?: string;
  variants?: { normal?: boolean; holo?: boolean; reverse?: boolean; firstEdition?: boolean; wPromo?: boolean };
  verified: true;
}
export interface Condition { centering: number; corners: number; edges: number; surface: number; print: number }
export interface PrintDefect {
  type: 'off-center' | 'miscut' | 'registration' | 'ink-defect'; side: 'front' | 'back' | 'both'; severity: number;
  offsetX: number; offsetY: number; cutTilt: number; registrationX: number; registrationY: number; inkBandY: number; inkBandWidth: number;
}
export interface Misprint {
  version: 1; modifier: 30; defect: PrintDefect;
  origin: 'individual' | 'full-pack'; packUid: string; productionId?: string;
  specialType?: 'english-151-demigod' | 'ascended-heroes-god';
}
export interface PackEvents {
  version: 1; special: { type: 'english-151-demigod'; line: 'venusaur' | 'charizard' | 'blastoise' } | { type: 'ascended-heroes-god' } | null;
  fullMisprint: boolean; production?: PrintDefect;
}
export interface RareEventStats { generatedPacks: number; eligibleSpecialPacks: number; specialPacks: number; fullMisprintPacks: number; combinedPacks: number; individualMisprints: number; fullPackMisprints: number; individualEligibleCards: number; specialIndividualMisprints: number }
export type Grader = 'PSA' | 'BGS' | 'CGC' | 'SGC' | 'TAG';
export interface CrackDamage { type: 'bent-corner' | 'edge-chip' | 'scratch' | 'dent' | 'crease'; side: 'front' | 'back' | 'both'; x: number; y: number; severity: number; length: number; angle: number }
export interface SlabCrackEvent { uid: string; at: number; seed: number; grader: Grader; grade: number; cert: string; outcome: 'safe' | 'damaged'; rawModifier: 1 | .5; conditionBefore: Condition; conditionAfter: Condition; damage: CrackDamage[] }
export interface GradingPopulationEntry { cardUid: string; cardId: string; grader: Grader; grade: number }
export interface OwnedCard { uid: string; cardId: string; condition: Condition; acquiredAt: number; source: string; favorite: boolean; status: 'raw' | 'grading' | 'graded'; grader?: Grader; grade?: number; subgrades?: number[]; owner: 'local-player'; finish: 'normal' | 'holo' | 'reverse' | 'metal'; origin: 'pack' | 'promo'; baseRawValue?: number; misprint?: Misprint; gradingHistory?: { grader: Grader; grade: number; at: number; orderUid: string }[]; crackHistory?: SlabCrackEvent[]; ownershipLock?: { kind: 'ebay' | 'trade' | 'transfer'; uid: string } }
export interface Pack { uid: string; setCode: string; productId: string; variant: number; price: number; purchasedAt: number; seed: number; sourceProduct?: string; owner: 'local-player'; state: 'unopened'; generationVersion: 1 | 2; rareEvents?: PackEvents; debugGenerated?: true }
export interface SealedProduct { uid: string; productId: string; price: number; purchasedAt: number; seed: number; owner: 'local-player'; state: 'sealed'; manifestRevision: 1 }
export interface ContainerOpening { productUid: string; stage: 'sealed' | 'contents' }
export interface ProductReceipt { productUid: string; productId: string; openedAt: number; packUids: string[]; cardUids: string[] }
export interface Opening { pack: Pack; cards: OwnedCard[]; stage: 'sealed' | 'cards' | 'complete'; index: number }
export interface PackReceipt { pack: Pack; generatedAt: number; cards: Pick<OwnedCard, 'uid' | 'cardId' | 'finish' | 'baseRawValue' | 'misprint'>[] }
export interface GradeOrder { uid: string; cardUid: string; grader: Grader; service: 'Standard' | 'Express'; paid: number; sentAt: number; dueAt: number; result: number; subgrades: number[] }
export interface Transaction { uid: string; type: 'purchase' | 'sale' | 'grading'; amount: number; label: string; at: number }
export interface Settings { graphics: 'Auto' | 'Low' | 'Medium' | 'High'; renderScale: number; sensitivity: number; master: number; music: number; sfx: number; fps: boolean; controlsLearned: boolean }
export interface Save { version: 2; gradingPopulation?: GradingPopulationEntry[]; rareEventStats?: RareEventStats; packReceipts?: PackReceipt[]; currency: number; packs: Pack[]; sealedProducts: SealedProduct[]; containerOpening: ContainerOpening | null; productReceipts: ProductReceipt[]; legacyArchive?: unknown; cards: OwnedCard[]; orders: GradeOrder[]; opening: Opening | null; displays: (string | null)[]; settings: Settings; stats: { opened: number; sold: number; spent: number }; history: Transaction[]; marketSeed: number }
export interface Product { code: string; name: string; subtitle: string; year: number; price: number; onlineDropPrice: number; physicalStorePrice: number; color: string; accent: string; type: 'booster' | 'etb' | 'upc' | 'bundle'; setCode: string; variant: string; releaseDate: string; artwork?: string; artworkStatus: 'unavailable' | 'verified'; manifest: { verified: boolean; revision: 1; sources: string[]; packs: { productId: string; quantity: number }[]; cards: { cardId: string; quantity: number; finish: OwnedCard['finish'] }[] } }
