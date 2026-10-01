import { Hero } from './hero/Hero';
import { About } from './sections/About';
import { PlayerSection } from './roblox/PlayerSection';
import { Work } from './sections/Work';
import { Contact } from './contact/Contact';
import { Footer } from './sections/Footer';

// Landmarks: the hero is the page <header> (banner), sections live in <main>, then <footer>.
export function App() {
  return (
    <>
      <Hero />
      <main id="main">
        <About />
        <PlayerSection />
        <Work />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
