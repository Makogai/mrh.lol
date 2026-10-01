import './contact.css';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { site } from '../config/site';
import { isSupabaseConfigured } from '../lib/env';
import { ChannelList } from './ChannelList';
import { ContactForm } from './ContactForm';
import { DiscordCard } from './DiscordCard';

// Production hides the form unless the backend was configured at build time (a form that can only fail is worse than
// no form); dev always shows it so the states can be worked on. Both inputs are build-time constants, so the
// prerendered HTML and the hydrating client always agree.
const showForm = site.contact.form.enabled && (isSupabaseConfigured || import.meta.env.DEV);

export function Contact() {
  const s = site.sections.contact;
  return (
    <Section id={s.id} index={s.index} title={s.title} intro={site.contact.intro} className="ct-bloom">
      {/* base: stacked · md: Discord full width, channels in 2 columns, form full width · xl: 12-col, 5 + 6 */}
      <div className="grid items-start gap-6 md:gap-8 xl:grid-cols-12 xl:gap-x-8">
        {showForm ? (
          <>
            <div className="flex flex-col gap-6 md:gap-8 xl:col-span-5">
              <Reveal><DiscordCard /></Reveal>
              <ChannelList />
            </div>
            <ContactForm className="xl:col-span-6 xl:col-start-7" />
          </>
        ) : (
          // No form: Discord and the channels share the row, tiles stretched to the card's height, so it reads as a
          // deliberate two-part composition rather than a layout with a hole in it.
          <>
            <Reveal className="xl:col-span-7"><DiscordCard /></Reveal>
            <ChannelList stretch className="xl:col-span-5 xl:self-stretch" />
          </>
        )}
      </div>
    </Section>
  );
}
