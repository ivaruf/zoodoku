/*
 * i18n.js — which language the zoo speaks, and every word it says.
 *
 * TWO LANGUAGES, NORWEGIAN FIRST (hub CLAUDE.md §2). Bokmål ("nb") and
 * English ("en"), nothing else. With nothing valid stored the zoo speaks
 * Norwegian whatever the browser prefers — no navigator.language sniffing,
 * which is the one deliberate difference from kitchens/js/i18n.js, where this
 * mechanism was worked out.
 *
 * ONE KEY FOR THE WHOLE HUB: arcade.lang.v1, holding "nb" or "en" and nothing
 * else. Not zoodoku.lang.v1 — a language is a fact about the player, not the
 * cabinet, and someone who chose English in one game should not have to
 * choose it ten times. Every read and write is in try/catch.
 *
 * THE FOUR NAMES every arcade game exports:
 *   t(key, ...args)    the current language, else English, else the key
 *                      itself, warning once per missing key in the console.
 *   getLang()          "nb" | "en"
 *   setLang(lang)      validates, stores, sets <html lang>, repaints the
 *                      static DOM, then dispatches `arcade:lang` on document
 *                      (detail: the language). Everything that draws words at
 *                      runtime — main.js, play.js, the self-contained
 *                      screen.js and update.js — listens for that and repaints
 *                      in place: no reload, no restart, no unpause.
 *   paintStatic(root)  every [data-i18n] gets its textContent, every
 *                      [data-i18n-label] its aria-label and title (plus
 *                      " (key)" on the title where data-i18n-kbd names one),
 *                      every [data-i18n-aria] its aria-label alone.
 *
 * VALUES MAY BE FUNCTIONS, because a language is not a template with blanks
 * in it: "1 pote" / "2 poter", "reven" where English says "the fox", and the
 * hint sentences, whose word order differs. The hint functions take one
 * context object built by js/play.js (see hintCtx there) and do all of their
 * own grammar here, so play.js never glues words together itself.
 *
 * THE WORDS are for the youngest players in the hub: short, warm, and real
 * bokmål — as a Norwegian would say it to a child of eight, never English
 * with Norwegian words swapped in. Menus use the hub glossary (Spill,
 * Fortsett, Tilbake, Lyd, Språk…); the zoo's own voice lives in the play
 * text — hints, the egg, the win card.
 *
 * NOT TRANSLATED: the name Zoodoku and its wordmark, the manifest (the
 * arcade reads it, in one language), console output, storage keys.
 *
 * This file must stay importable outside a browser (nothing in tests/ needs
 * it today, but a module that throws on import in Node is a trap), so every
 * touch of document or localStorage is guarded.
 */

const KEY = "arcade.lang.v1";
const LANGS = ["nb", "en"];

function stored() {
  try {
    const v = localStorage.getItem(KEY);
    if (LANGS.includes(v)) return v;
  } catch {
    // No storage (private mode, a sandbox, Node): the default applies.
  }
  return "nb";
}

let lang = stored();
if (typeof document !== "undefined") document.documentElement.lang = lang;

export const getLang = () => lang;

/* ============================================================ grammar */

// Animals, by id (js/animals.js). Bokmål needs the definite form too:
// English says "the fox", Norwegian folds the article into the noun.
const ANIMAL = {
  en: {
    fox: ["fox", "the fox", "foxes"],
    frog: ["frog", "the frog", "frogs"],
    whale: ["whale", "the whale", "whales"],
    lion: ["lion", "the lion", "lions"],
    pig: ["pig", "the pig", "pigs"],
    owl: ["owl", "the owl", "owls"],
    bear: ["bear", "the bear", "bears"],
    penguin: ["penguin", "the penguin", "penguins"],
    crab: ["crab", "the crab", "crabs"],
  },
  nb: {
    fox: ["rev", "reven", "rever"],
    frog: ["frosk", "frosken", "frosker"],
    whale: ["hval", "hvalen", "hvaler"],
    lion: ["løve", "løven", "løver"],
    pig: ["gris", "grisen", "griser"],
    owl: ["ugle", "ugla", "ugler"],
    bear: ["bjørn", "bjørnen", "bjørner"],
    penguin: ["pingvin", "pingvinen", "pingviner"],
    crab: ["krabbe", "krabben", "krabber"],
  },
};

/* "a, b and c" — `or` swaps the last joint. */
function joinEn(items, or = false) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${or ? "or" : "and"} ${items[items.length - 1]}`;
}
function joinNb(items, or = false) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${or ? "eller" : "og"} ${items[items.length - 1]}`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Hint context words (play.js passes types; the words live here).
//   unit:  row | col | box | cell | group | area
//   line:  row | col | line        lines / cross: rows | cols
const EN_UNIT = { row: "row", col: "column", box: "box", cell: "square", group: "pattern", area: "area" };
const EN_LINES = { rows: "rows", cols: "columns" };
const NB_THIS = {
  row: "denne raden",
  col: "denne kolonnen",
  box: "denne boksen",
  cell: "denne ruten",
  group: "dette mønsteret",
  area: "dette området",
};
const NB_LINE = { row: "rad", col: "kolonne", line: "linje" };
const NB_THAT_LINE = { row: "den raden", col: "den kolonnen", line: "den linja" };
const NB_LINES_DEF = { rows: "radene", cols: "kolonnene" };

/* ============================================================ the words */

const STRINGS = {
  nb: {
    // ---- the page
    tagline: "Sudoku som starter med en rev.",
    "nav.start": "Start",
    "door.play": "▶ Spill",
    "door.resume": "▶ Fortsett",
    "door.allSolved": "Alle nivåer er løst — velg det du vil",
    "door.levels": "Nivåer",
    "door.free": "Fritt spill",
    "door.howto": "Slik spiller du",
    "door.newHere": "Ny her?",
    back: "Tilbake",
    "exit.arcade": "Tilbake til arkaden",
    "exit.close": "Lukk",
    "exit.refused": "Lukk vinduet selv",
    "update.main": "Ny versjon klar",
    "update.sub": "Trykk for å oppdatere",

    // ---- levels (the trail map)
    "levels.title": "Nivåer",
    "region.4": "Dammen",
    "region.6": "Engen",
    "region.9": "Savannen",
    regionCount: (done, of) => `${done} av ${of}`,
    "stop.here": "ditt brett",
    "stop.next": "litt vanskeligere",
    stopLabel: (level, region, state) =>
      `Nivå ${level}, ${region}` +
      (state === "here" ? ", brettet du holder på med" : state === "solved" ? ", løst" : state === "next" ? ", neste — litt vanskeligere" : ""),

    // ---- free play
    "free.title": "Fritt spill",
    "free.hint": "Hvilket brett du vil, når du vil. De tar aldri slutt.",
    "free.board": "Brett",
    "size.4": "Lite",
    "size.6": "Middels",
    "size.9": "Stort",
    "free.skin": "Vis som",
    "skin.animals": "Dyr",
    "skin.numbers": "Tall",
    "free.paws": "Hvor vanskelig",
    paws: (n, of) => `${n} ${n === 1 ? "pote" : "poter"}${of ? ` av ${of}` : ""}`,
    "paws.easy": "en rolig tur.",
    "paws.hardest": "det vanskeligste vi har.",
    "paws.hard": "trenger notater og skarpe øyne.",
    "paws.mid": "en skikkelig nøtt.",
    "free.go": "Spill",

    // ---- describing a board
    describeLevel: (level, region, size) => `Nivå ${level} · ${region}${size ? ` ${size}` : ""}`,
    describeFree: (size, paws) => `Fritt spill · ${size} · ${paws}`,
    describeTutorial: (i, of) => `Slik spiller du · ${i} av ${of}`,

    // ---- play screen
    "play.aria": "Brett",
    "play.skip": "Hopp over",
    "hatch.busy": "Klekker et brett…",
    "hatch.failed": "Det egget ville ikke klekkes. Prøv et annet?",
    "coach.size6": "Nå er boksene større: 2 høye og 3 brede.",
    "coach.size9": "Nå blir det tall — og notater, så du husker hva som kan passe.",
    "tut.coach.0": "Hver rad trenger ett av hvert dyr. Finn hullet i en rad og fyll det!",
    "tut.coach.1": "Kolonner går fra topp til bunn. Hver kolonne trenger også ett av hvert dyr.",
    "tut.coach.2": "De tykke strekene lager bokser. Hver boks trenger også ett av hvert dyr!",

    // ---- win card
    "win.animals": "Alle er hjemme!",
    "win.numbers": "Alle tallene er hjemme!",
    "win.nextLevel": "Neste nivå",
    "win.newBoard": "Nytt brett",
    "tut.win.0": "Rader: ett av hvert.",
    "tut.win.1": "Kolonner også.",
    "tut.win.2": "Og bokser. Det er hele sudoku!",
    "tut.gotIt": "Sånn, ja!",
    "tut.done": "Nå kan du reglene!",
    "tut.next": "Neste",
    "tut.skipRest": "Hopp over resten",

    // ---- the corner and the menu
    menu: "Meny",
    mute: "Lyd av",
    unmute: "Lyd på",
    "menu.kicker": "Dyrene venter på deg",
    "menu.paused": "Pause",
    "menu.settings": "Innstillinger",
    "menu.resume": "Fortsett",
    "menu.skin": "Vis som",
    "menu.clashes": "Vis feil",
    on: "På",
    off: "Av",
    "menu.restart": "Start på nytt",
    "menu.skip": "Hopp over",
    "menu.music": "Musikk",
    "menu.sfx": "Effekter",
    "menu.soundHint": "Det er stille i dyrehagen ennå — lyden kommer snart.",
    "menu.lang": "Språk",

    // ---- questions
    "ask.leave": "Gå fra brettet du holder på med?",
    askLeaveNote: (what) => `${what} venter på deg. Går du fra det, begynner det på nytt neste gang.`,
    "ask.leaveYes": "Gå fra det",
    "ask.keep": "Behold det",
    "ask.restart": "Starte brettet på nytt?",
    "ask.restartNote": "Alle brikkene du har lagt ut, går tilbake.",
    "ask.restartYes": "Start på nytt",
    "ask.restartNo": "Spill videre",


    // ---- the board, for a screen reader
    boardLabel: (n) => `Brett, ${n} ganger ${n}`,
    cellLabel: (r, c) => `Rad ${r}, kolonne ${c}: `,
    "cell.given": ", ligger fast",
    "cell.clash": ", passer ikke",
    "cell.empty": "tom",
    cellNotes: (names) => `, notater: ${names.join(", ")}`,
    trayLabel: (skin) => (skin === "numbers" ? "Tall" : "Dyr"),
    trayTile: (name, left) => `${name}, ${left ? `${left} igjen` : "alle er lagt ut"}`,
    tools: "Verktøy",
    "tool.undo": "Angre",
    "tool.erase": "Visk ut",
    "tool.notes": "Notater",
    "tool.hint": "Tips",
    "tool.check": "Sjekk",

    // ---- symbols: name / definite / indefinite, by id or digit
    symName: (id, d) => (id ? ANIMAL.nb[id][0] : String(d)),
    symThe: (id, d) => (id ? ANIMAL.nb[id][1] : `${d}-eren`),
    symA: (id, d) => (id ? `en ${ANIMAL.nb[id][0]}` : `en ${d}-er`),
    symMany: (id, d) => (id ? ANIMAL.nb[id][2] : `${d}-ere`),
    list: (items, or) => joinNb(items, or),

    // ---- the coach
    "coach.gotIt": "Skjønner",
    "coach.more": "Si mer",
    "coach.show": "Vis meg",
    "coach.which": "Hvilken?",
    takeOff: (n) => (n === 1 ? "Ta den bort" : "Ta dem bort"),
    "check.nothing": "Ingenting å sjekke ennå — legg ut noen brikker først.",
    checkWrong: (n) => (n === 1 ? "Én brikke passer ikke — den er merket." : `${n} brikker passer ikke — de er merket.`),
    "check.fine": "Alt passer så langt.",
    "hint.none": "Det er ingenting mer å finne!",
    "hint.wrong1": "Noe her passer ikke.",
    hintWrong2: (n) => (n === 1 ? "Denne passer ikke." : "Disse passer ikke."),
    "hint.look": "Se på denne ruten.",
    "hint.revealWhy": "Raden, kolonnen og boksen lar bare én brikke passe her.",
    "hint.gone": "Borte! Fortsett herfra.",
    hintThere: (a) => `Der — ${a}.`,
    hintInGoes: (the) => `Inn med ${the}.`,
    "hint.inTheyGo": "Inn med dem.",
    "hint.notesOff": "De merkene trenger du ikke i notatene.",
    hintLeads: (a) => `Det fører hit — ${a}.`,
    hint1: (k, c) => {
      switch (k) {
        case "hidden_single_box":
          return `Se på denne boksen. Hvor kan ${c.the} være?`;
        case "hidden_single_line":
          return `Se på ${NB_THIS[c.unit]}. Hvor kan ${c.the} være?`;
        case "naked_single":
        case "reveal":
          return "Se på denne ruten.";
        case "x_wing":
          return `Se på ${c.the} i disse to ${NB_LINES_DEF[c.lines]}.`;
        case "swordfish":
          return `Se på ${c.the} i disse tre ${NB_LINES_DEF[c.lines]}.`;
        case "xy_wing":
          return "Se på disse tre rutene.";
        default:
          return `Se på ${NB_THIS[c.unit]}.`;
      }
    },
    hint2: (k, c) => {
      const L = (xs, or) => joinNb(xs, or);
      switch (k) {
        case "full_house":
          return `Bare én rute er igjen i ${NB_THIS[c.unit]} — og bare ${c.a} mangler.`;
        case "hidden_single_box":
        case "hidden_single_line":
          return `Alle de andre rutene her er stengt for ${c.the} — av disse.`;
        case "naked_single":
          return `Raden, kolonnen og boksen har allerede alt det andre. Bare ${c.a} passer.`;
        case "reveal":
          return `Denne ruten har færrest valg. Den trenger ${c.a}.`;
        case "pointing":
          return `I denne boksen kan ${c.the} bare være langs én ${NB_LINE[c.line]} — så resten av ${NB_THAT_LINE[c.line]} kan ikke ha den.`;
        case "claiming":
          return `I ${NB_THIS[c.unit]} passer ${c.the} bare inne i én boks — så resten av den boksen kan ikke ha den.`;
        case "naked_pair":
          return `Disse to rutene kan bare være ${L(c.as.slice(0, 2), true)} — så ingen andre ruter i ${NB_THIS[c.unit]} kan være noen av dem.`;
        case "hidden_pair":
          return `${cap(L(c.as.slice(0, 2)))} kan bare være i disse to rutene — så de rutene kan ikke ha noe annet.`;
        case "naked_triple":
          return `Disse tre rutene deler bare ${L(c.as.slice(0, 3))} — så ingen andre ruter i ${NB_THIS[c.unit]} kan være noen av dem.`;
        case "hidden_triple":
          return `${cap(L(c.as.slice(0, 3)))} passer bare i disse tre rutene — så de rutene har ikke plass til noe annet.`;
        case "x_wing":
          return `I begge ${NB_LINES_DEF[c.lines]} har ${c.the} bare to plasser, og de står på linje — så den kan ikke være noe annet sted i de ${NB_LINES_DEF[c.cross]}.`;
        case "swordfish":
          return `I disse tre ${NB_LINES_DEF[c.lines]} passer ${c.the} bare i de samme tre ${NB_LINES_DEF[c.cross]} — så ingen andre steder i de ${NB_LINES_DEF[c.cross]}.`;
        case "xy_wing":
          return `Uansett hvordan disse tre rutene blir, er en av endene ${c.a} — så en rute som ser begge endene, kan ikke være ${c.a}.`;
        default:
          return c.d ? `Det er bare ett sted ${c.the} kan være.` : "Det er bare én måte dette kan gå på.";
      }
    },
  },

  en: {
    tagline: "Sudoku, starting with a fox.",
    "nav.start": "Start",
    "door.play": "▶ Play",
    "door.resume": "▶ Resume",
    "door.allSolved": "Every level solved — pick any",
    "door.levels": "Levels",
    "door.free": "Free play",
    "door.howto": "How to play",
    "door.newHere": "New here?",
    back: "Back",
    "exit.arcade": "Back to arcade",
    "exit.close": "Close",
    "exit.refused": "Close this window yourself",
    "update.main": "Update ready",
    "update.sub": "Tap to update",

    "levels.title": "Levels",
    "region.4": "Pond",
    "region.6": "Meadow",
    "region.9": "Savanna",
    regionCount: (done, of) => `${done} of ${of}`,
    "stop.here": "your puzzle",
    "stop.next": "a little harder",
    stopLabel: (level, region, state) =>
      `Level ${level}, ${region}` +
      (state === "here" ? ", your puzzle in progress" : state === "solved" ? ", solved" : state === "next" ? ", next — a little harder" : ""),

    "free.title": "Free play",
    "free.hint": "Any board, any time. They never run out.",
    "free.board": "Board",
    "size.4": "Small",
    "size.6": "Medium",
    "size.9": "Large",
    "free.skin": "Show as",
    "skin.animals": "Animals",
    "skin.numbers": "Numbers",
    "free.paws": "How hard",
    paws: (n, of) => `${n} ${n === 1 ? "paw" : "paws"}${of ? ` of ${of}` : ""}`,
    "paws.easy": "a gentle stroll.",
    "paws.hardest": "the trickiest we have.",
    "paws.hard": "needs notes and a sharp eye.",
    "paws.mid": "a proper puzzle.",
    "free.go": "Play",

    describeLevel: (level, region, size) => `Level ${level} · ${region}${size ? ` ${size}` : ""}`,
    describeFree: (size, paws) => `Free play · ${size} · ${paws}`,
    describeTutorial: (i, of) => `How to play · ${i} of ${of}`,

    "play.aria": "Puzzle",
    "play.skip": "Skip",
    "hatch.busy": "Hatching a puzzle…",
    "hatch.failed": "That one wouldn't hatch. Try another?",
    "coach.size6": "Bigger boxes now: 2 tall and 3 wide.",
    "coach.size9": "Numbers now — and notes, for keeping track.",
    "tut.coach.0": "Every row needs one of each animal. Find the gap in a row and fill it!",
    "tut.coach.1": "Columns go top to bottom. Every column needs one of each animal too.",
    "tut.coach.2": "The thick lines make boxes. Every box needs one of each animal as well!",

    "win.animals": "Everyone's home!",
    "win.numbers": "Every number home!",
    "win.nextLevel": "Next level",
    "win.newBoard": "New puzzle",
    "tut.win.0": "Rows: one of each.",
    "tut.win.1": "Columns too.",
    "tut.win.2": "And boxes. That's all of sudoku.",
    "tut.gotIt": "Got it!",
    "tut.done": "You know the rules!",
    "tut.next": "Next",
    "tut.skipRest": "Skip the rest",

    menu: "Menu",
    mute: "Mute",
    unmute: "Unmute",
    "menu.kicker": "The animals will wait",
    "menu.paused": "Paused",
    "menu.settings": "Settings",
    "menu.resume": "Resume",
    "menu.skin": "Show as",
    "menu.clashes": "Show clashes",
    on: "On",
    off: "Off",
    "menu.restart": "Restart",
    "menu.skip": "Skip",
    "menu.music": "Music",
    "menu.sfx": "Effects",
    "menu.soundHint": "The zoo is quiet for now — sound is coming.",
    "menu.lang": "Language",

    "ask.leave": "Leave your current puzzle?",
    askLeaveNote: (what) => `${what} is still waiting. Leaving it starts that one fresh next time.`,
    "ask.leaveYes": "Leave it",
    "ask.keep": "Keep it",
    "ask.restart": "Start this puzzle over?",
    "ask.restartNote": "Everything you placed goes back to the tray.",
    "ask.restartYes": "Start over",
    "ask.restartNo": "Keep going",


    boardLabel: (n) => `Puzzle board, ${n} by ${n}`,
    cellLabel: (r, c) => `Row ${r}, column ${c}: `,
    "cell.given": ", given",
    "cell.clash": ", clashes",
    "cell.empty": "empty",
    cellNotes: (names) => `, notes: ${names.join(", ")}`,
    trayLabel: (skin) => (skin === "numbers" ? "Numbers" : "Animals"),
    trayTile: (name, left) => `${name}, ${left ? `${left} left` : "all placed"}`,
    tools: "Tools",
    "tool.undo": "Undo",
    "tool.erase": "Erase",
    "tool.notes": "Notes",
    "tool.hint": "Hint",
    "tool.check": "Check",

    symName: (id, d) => (id ? ANIMAL.en[id][0] : String(d)),
    symThe: (id, d) => (id ? ANIMAL.en[id][1] : `the ${d}`),
    symA: (id, d) => {
      const n = id ? ANIMAL.en[id][0] : String(d);
      return `${/^[aeiou8]/i.test(n) ? "an" : "a"} ${n}`;
    },
    symMany: (id, d) => (id ? ANIMAL.en[id][2] : `${d}s`),
    list: (items, or) => joinEn(items, or),

    "coach.gotIt": "Got it",
    "coach.more": "Tell me more",
    "coach.show": "Show me",
    "coach.which": "Which one?",
    takeOff: (n) => (n === 1 ? "Take it off" : "Take them off"),
    "check.nothing": "Nothing to check yet — put some pieces down first.",
    checkWrong: (n) => (n === 1 ? "One piece doesn’t belong — it’s marked." : `${n} pieces don’t belong — they’re marked.`),
    "check.fine": "Everything so far fits.",
    "hint.none": "Nothing left to find!",
    "hint.wrong1": "Something here doesn’t fit.",
    hintWrong2: (n) => (n === 1 ? "This one doesn’t belong." : "These don’t belong."),
    "hint.look": "Look at this square.",
    "hint.revealWhy": "Its row, column and box leave just one piece that fits.",
    "hint.gone": "Gone. Carry on from here.",
    hintThere: (a) => `There — ${a}.`,
    hintInGoes: (the) => `In goes ${the}.`,
    "hint.inTheyGo": "In they go.",
    "hint.notesOff": "Those marks can come off your notes.",
    hintLeads: (a) => `That leads here — ${a}.`,
    hint1: (k, c) => {
      const unit = EN_UNIT[c.unit];
      switch (k) {
        case "hidden_single_box":
          return `Look at this box. Where can ${c.the} go?`;
        case "hidden_single_line":
          return `Look at this ${unit}. Where can ${c.the} go?`;
        case "naked_single":
        case "reveal":
          return "Look at this square.";
        case "x_wing":
          return `Look at ${c.the} in these two ${EN_LINES[c.lines]}.`;
        case "swordfish":
          return `Look at ${c.the} in these three ${EN_LINES[c.lines]}.`;
        case "xy_wing":
          return "Look at these three squares.";
        default:
          return `Look at this ${unit}.`;
      }
    },
    hint2: (k, c) => {
      const unit = EN_UNIT[c.unit];
      const line = EN_UNIT[c.line] || "line";
      const lines = EN_LINES[c.lines];
      const cross = EN_LINES[c.cross];
      switch (k) {
        case "full_house":
          return `Only one square is left in this ${unit} — and only ${c.a} is missing.`;
        case "hidden_single_box":
        case "hidden_single_line":
          return `Every other square here is blocked for ${c.the} — by these.`;
        case "naked_single":
          return `Its row, column and box already have everything else. Only ${c.a} fits.`;
        case "reveal":
          return `This square has the fewest choices. It needs ${c.a}.`;
        case "pointing":
          return `In this box, ${c.the} can only go along one ${line} — so the rest of that ${line} can’t have it.`;
        case "claiming":
          return `In this ${unit}, ${c.the} only fits inside one box — so the rest of that box can’t have it.`;
        case "naked_pair":
          return `These two squares can only be ${joinEn(c.as.slice(0, 2), true)} — so nothing else in this ${unit} can be either.`;
        case "hidden_pair":
          return `${cap(joinEn(c.as.slice(0, 2)))} can only go in these two squares — so those squares can’t hold anything else.`;
        case "naked_triple":
          return `These three squares share just ${joinEn(c.as.slice(0, 3))} — so nothing else in this ${unit} can be those.`;
        case "hidden_triple":
          return `${cap(joinEn(c.as.slice(0, 3)))} only fit in these three squares — so those squares hold nothing else.`;
        case "x_wing":
          return `In both ${lines}, ${c.the} has just two spots, and they line up — so it can’t go anywhere else in those ${cross}.`;
        case "swordfish":
          return `In these three ${lines}, ${c.the} only fits in the same three ${cross} — so nowhere else in those ${cross}.`;
        case "xy_wing":
          return `However these three squares turn out, one of the ends is ${c.a} — so a square that sees both ends can’t be ${c.a}.`;
        default:
          return c.d ? `There is only one place ${c.the} can go.` : "There is only one way this can go.";
      }
    },
  },
};

/* ============================================================ lookup */

const warned = new Set();

export function t(key, ...args) {
  let v = STRINGS[lang][key];
  if (v === undefined) {
    v = STRINGS.en[key];
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`Zoodoku i18n: no "${key}" in ${v === undefined ? "any language" : lang}`);
    }
    if (v === undefined) return key;
  }
  return typeof v === "function" ? v(...args) : v;
}

/** Every static string in the page, from its data-i18n* attributes. */
export function paintStatic(root = document) {
  if (!root || !root.querySelectorAll) return;
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  // aria-label alone, for a region that should not grow a hover tooltip.
  for (const el of root.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll("[data-i18n-label]")) {
    const label = t(el.dataset.i18nLabel);
    el.setAttribute("aria-label", label);
    el.title = el.dataset.i18nKbd ? `${label} (${el.dataset.i18nKbd})` : label;
  }
  // The language buttons say which one is chosen, wherever they are.
  for (const el of root.querySelectorAll("button[data-lang]")) {
    el.setAttribute("aria-pressed", String(el.dataset.lang === lang));
  }
}

export function setLang(next) {
  if (!LANGS.includes(next)) return;
  lang = next;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Not remembered; this visit still switches.
  }
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  paintStatic(document);
  document.dispatchEvent(new CustomEvent("arcade:lang", { detail: lang }));
}
