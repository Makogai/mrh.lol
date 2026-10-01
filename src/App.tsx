import { Hero } from './hero/Hero';
import { Loadout } from './loadout/Loadout';
import { Contact } from './contact/Contact';
import { Lobby } from './squad/Lobby';
import { Footer } from './shell/Footer';
import { SystemBar } from './shell/SystemBar';
import { Work } from './work/Work';

// Page order (V2_DESIGN §1): bar · 00 MAIN MENU · 01 LOADOUT · 02 BUILDS · 03 LOBBY · 04 COMMS · footer.
// The system bar is the FIRST child and sits outside every animated wrapper (trap #1: a transformed ancestor would become the
// containing block of its `position: fixed`). Landmarks: the hero is the page <header> (banner), sections live in <main>.
export function App() {
  return (
    <>
      <SystemBar />
      <Hero />
      <main id="main">
        <Loadout />
        <Work />
        <Lobby />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
