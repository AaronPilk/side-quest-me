import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Mail } from "lucide-react";
import {
  INFORMATION_LINKS,
  POLICY_UPDATED,
  PUBLIC_SUPPORT_EMAIL,
} from "../lib/public-information";
import "./public-information.css";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="information-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Contact({ subject = "Sidequest support" }: { subject?: string }) {
  return PUBLIC_SUPPORT_EMAIL ? (
    <a
      className="information-contact"
      href={`mailto:${PUBLIC_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`}
    >
      <Mail size={20} aria-hidden="true" />
      <span>{PUBLIC_SUPPORT_EMAIL}</span>
      <ArrowUpRight size={18} aria-hidden="true" />
    </a>
  ) : (
    <p className="information-contact-pending" role="status">
      Support contact details are being configured. This release is not ready
      for public availability until a monitored contact is published here.
    </p>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <p className="information-intro">
        Your private journal is yours. This policy explains what Sidequest
        processes when you plan, film, save and share a quest.
      </p>
      <Section title="Information you provide">
        <p>
          We process your email and account identifier for sign-in, and the
          profile details you choose to enter, such as your display name,
          username, avatar, bio and account type. Optional quest preferences
          include interests, skills, humor, boundaries and an imported summary
          you can review, edit or remove. Please leave sensitive information out
          of that summary.
        </p>
        <p>
          You may also choose an age group: under 18, 18–20 or 21+. We store
          this private account answer to match age-appropriate experiences. We
          do not ask for a birth date or identity document, and this answer is
          not age verification. You can change or clear it in Account & quest
          preferences. Without a confirmed adult age group, adult experiences
          are excluded.
        </p>
        <p>
          We store your outing choices, accepted quests, completion records,
          saved series, reward records and the content you upload or create:
          videos, recorded audio, photos, overlays and captions. Social actions
          such as likes, follows, blocks and reports are also processed.
          Business accounts may provide business profile and licensing
          information.
        </p>
      </Section>
      <Section title="Camera, photos and location">
        <p>
          Camera and microphone access lets you record. The photo picker lets
          you choose media to import or an image overlay. These permissions do
          not give Sidequest access to every item in your library. You can
          decline permissions and change them in your device settings.
        </p>
        <p>
          Nearby lookup uses your foreground location only when you choose to
          share it. Coordinates can be sent to Apple for place search and to our
          backend for an area-based event lookup. A configured event provider
          receives an area or approximate search area. Sidequest does not
          continuously track your location in the background. You can enter an
          area manually instead. Selected area text, an Apple place identifier,
          destination name and street address may be saved with your outing.
          Imported source footage can retain location metadata embedded in the
          original file. Final rendered videos strip that metadata.
        </p>
      </Section>
      <Section title="How information is used">
        <p>
          We use this information to authenticate you, personalize eligible
          quest suggestions, preserve your progress, render and deliver videos,
          operate social and series features, administer eligible rewards and
          licensing records, respond to reports, and protect the service from
          abuse. Necessary service diagnostics include request status, timing
          and error categories. Network providers also process connection
          information such as IP addresses to deliver and secure requests.
        </p>
        <p>
          When funded sponsored quests are available, saved area and category
          choices help select eligible offers. We record an accepted sponsored
          quest and its disclosure to administer that offer. This does not use
          cross-app tracking.
        </p>
      </Section>
      <Section title="Private and public content">
        <p>
          Your journal, imported summary, age group, confirmed preferences and
          source footage are private to your account. A reel becomes public
          after you submit it for publication and an independent operator
          approves its full video, caption and quest instructions. Updates
          require another review. Your public profile, published posts and
          series are visible to other people. Creating a share link makes the
          linked content accessible to people who have that link. A downloaded
          copy cannot be recalled by unpublishing or deleting the original.
        </p>
        <p>
          Making a video available for a business offer is a separate choice. A
          licensing offer does not transfer rights automatically; the accepted
          terms and recorded fulfillment govern that use.
        </p>
      </Section>
      <Section title="Service providers and optional AI">
        <p>
          Supabase provides account authentication and database storage.
          Cloudflare provides our application backend, private media storage and
          video processing. Apple provides Maps and native system services. A
          configured event service, such as Ticketmaster, provides nearby
          listings. These providers process data needed for those functions
          under their applicable policies.
        </p>
        <p>
          AI generation asks for consent to the named provider before sending
          confirmed preferences, your optional age group for experience
          planning, outing limits and relevant selected place or activity
          context. The current provider is OpenAI. Your name, raw imported
          summary and exact device coordinates are excluded from these AI
          requests. Sidequest requests that OpenAI not store the generated
          response, but this is not a promise of zero provider retention; the
          provider’s applicable data controls govern its processing.
        </p>
        <p>
          Before public profile content or series text is shared, we ask your
          permission to send the submitted public name, username, bio and
          normalized profile photo, or public series title, premise and
          published chapter text and quest instructions, to OpenAI for content
          review and filtering. Public quest instructions may name a chosen
          destination. This screening excludes your email, exact device
          coordinates, preferences, imported summary, private journal video and
          audio, and unpublished chapter text. Rejected content or a review
          outage leaves those changes unshared. Video publication uses a
          separate operator review.
        </p>
        <p>
          “Copy prompt and open ChatGPT” copies text for you to paste yourself.
          Sidequest does not receive your ChatGPT history or subscription
          credentials. External services and links have their own privacy
          practices. The current app does not use the advertising identifier or
          an advertising attribution SDK to track you across other apps.
        </p>
      </Section>
      <Section title="Storage, retention and deletion">
        <p>
          Local capture drafts and recoverable camera recordings stay private on
          your device and are scoped to your account and quest. Saved drafts
          expire seven days after their last save. Separate camera recovery
          files expire seven days after recording. Expiry is checked when you
          reopen a quest, and sign-out clears both. These files are not a cloud
          backup and can be lost if device storage is cleared. Server source
          footage is eligible for cleanup after 30 days when a completed reel is
          safely retained or a run has been abandoned; pending work and
          unresolved review or failures can extend that period. Saved final
          reels do not automatically expire, subject to the account’s storage
          limit and your deletion choices.
        </p>
        <p>
          You can start account deletion in Settings → Account settings → Delete
          my account. This removes public availability, revokes share access and
          queues media cleanup. Storage and authentication cleanup run
          asynchronously and retry if needed. Minimal accounting and licensing
          records are retained to preserve settled transactions and agreed
          rights. Copies already downloaded or received by other people remain
          outside our control.
        </p>
      </Section>
      <Section title="Your choices and privacy requests">
        <p>
          Review or change your profile and preferences from your profile or
          Settings. Remove your saved imported summary from Account & quest
          preferences. Change camera, microphone and location permissions in
          device settings. You can choose to keep a reel private, unpublish a
          post, remove media, block an account or delete your account. Contact
          us with access, correction, deletion or other privacy requests. Rights
          available to you depend on your location.
        </p>
        <Contact subject="Sidequest privacy request" />
      </Section>
      <Section title="Policy updates">
        <p>
          We will update this page when our practices change and identify its
          latest update date. Material changes will be communicated through the
          service when appropriate.
        </p>
      </Section>
    </>
  );
}

function Support() {
  return (
    <>
      <p className="information-intro">
        Need a hand with a quest, your account or a video? Start here.
      </p>
      <Section title="Contact Sidequest">
        <p>
          For account help, bugs, privacy questions or a content concern,
          contact our support team. Include your app version and a short
          description of what happened. Never send passwords, sign-in links, API
          keys or payment card details.
        </p>
        <Contact />
      </Section>
      <Section title="Sign-in and your account">
        <p>
          For email-link sign-in, open the newest secure link on the same phone
          to return to the app. If it has expired, request a new one and check
          your junk folder. If your account has a password, choose “Sign in with
          password” on the welcome screen. Account controls, including sign-out
          and account deletion, are in Settings → Account settings.
        </p>
        <Link className="information-action" to="/account/security">
          Account settings <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </Section>
      <Section title="Camera and saved videos">
        <p>
          Allow camera and microphone access in your phone’s Settings to record.
          You can also import a video from your library. A local draft stays on
          the device where you saved it; upload it before changing devices. Keep
          the app open while a recording is being finalized. If video processing
          fails, your quest page shows the available retry or replacement
          action.
        </p>
      </Section>
      <Section title="Nearby places and bookings">
        <p>
          Location is optional. Enter an area manually if location access is
          unavailable. Maps and event listings are starting points: check
          opening times, admission, availability, accessibility and venue rules
          directly before you travel or buy a ticket. Sidequest does not make a
          reservation for you.
        </p>
      </Section>
      <Section title="Report a concern">
        <p>
          Open a post’s menu to report it or block its creator. Licensing offers
          also have a report action. Include a clear reason so our operators can
          review the concern. For a concern you cannot report in the app,
          contact support with the relevant post or account link. Immediate
          emergencies belong with local emergency services.
        </p>
        <Link className="information-action" to="/community-guidelines">
          Community guidelines <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <p className="information-intro">
        These terms describe how to use Sidequest and how your stories are
        handled. Read them alongside our privacy policy and community
        guidelines.
      </p>
      <Section title="Using your account">
        <p>
          Keep your sign-in links private, provide accurate account information
          and use an account you are authorized to operate. Do not impersonate
          another person or business, bypass access controls, manipulate
          rewards, or misuse the service. Business and operator permissions are
          separate from ordinary account access.
        </p>
      </Section>
      <Section title="A suggestion is a plan to check">
        <p>
          Quest suggestions, including AI-generated ideas, can be incomplete or
          wrong. Confirm costs, venue access, opening times, bookings,
          equipment, participant consent and local rules before starting. You
          choose whether an activity is appropriate for you and your group.
          Respect your limits and stop an activity that becomes unsafe. A
          suggestion does not override laws or venue rules.
        </p>
        <p>
          Purchases and bookings with a venue or external provider are made with
          that provider under its terms. Sidequest does not guarantee
          availability or purchase tickets on your behalf.
        </p>
      </Section>
      <Section title="Your content and permission to operate the app">
        <p>
          You retain ownership of the content you create. Upload only material
          you have the right to use, including audio, images and footage of
          other people. Obtain permission from recognizable participants and
          respect private places and personal information.
        </p>
        <p>
          By uploading content, you give Sidequest permission to store, process,
          format and deliver it to operate the features you choose. Publishing
          or enabling a share link authorizes delivery through that public or
          shared feature. This permission does not by itself sell your video or
          authorize a business to use it in advertising. Separate accepted
          licensing terms govern a business license.
        </p>
      </Section>
      <Section title="Sharing, removal and moderation">
        <p>
          Private content stays private until you choose to share or publish.
          Public content must follow our community guidelines. Reports can be
          reviewed by operators, and content or access may be restricted for
          violations or abuse. You can report a post, block a creator, unpublish
          your content or initiate account deletion. Deletion cannot retrieve
          copies already downloaded by other people.
        </p>
      </Section>
      <Section title="Rewards and business features">
        <p>
          Eligible rewards follow the quest’s displayed rules, completion
          requirements and limits. Repeating a quest within its cooldown or
          completing a private generated quest may not earn an award. Progress
          and points are not a promise of cash payment.
        </p>
        <p>
          Business licensing features record proposed and accepted usage terms.
          A proposal alone is not an approved license or completed payment.
          Fulfillment and permission checks are handled separately; Sidequest
          does not promise automatic payouts, advertising results or sales
          attribution.
        </p>
      </Section>
      <Section title="Availability and changes">
        <p>
          Features depend on network access, your device and external services.
          Save important downloaded copies yourself; local drafts are temporary.
          We may update the service and these terms as the app changes. The date
          on this page identifies the current version.
        </p>
      </Section>
      <Section title="Questions">
        <Contact subject="Sidequest terms question" />
      </Section>
    </>
  );
}

function CommunityGuidelines() {
  return (
    <>
      <p className="information-intro">
        Make a story worth telling. Give everyone involved a choice to be part
        of it.
      </p>
      <Section title="Respect people and consent">
        <p>
          Ask before filming recognizable people. Stop if someone declines or
          asks you to stop. Do not target people for humiliation, harass them,
          reveal private information, discriminate or make threats. Do not
          exploit someone’s vulnerability for a reaction or a video.
        </p>
      </Section>
      <Section title="Keep challenges responsible">
        <p>
          No dangerous stunts, trespassing, violence, illegal activities or
          challenges that pressure people to consume excessive alcohol or drugs.
          Never combine intoxication with driving, water activities, heights,
          trampolines or other hazardous activities. Respect venue rules and
          leave spaces as you found them.
        </p>
      </Section>
      <Section title="Keep public content appropriate">
        <p>
          Do not upload sexual exploitation, explicit sexual material, graphic
          violence, hateful content, scams or content that encourages self-harm.
          Do not post material involving the sexual exploitation of minors.
          Public posts must respect the rights and dignity of people shown.
        </p>
      </Section>
      <Section title="Be honest and respect creators">
        <p>
          Share the real outcome. Do not falsify a completion to earn rewards or
          impersonate a person or brand. Use footage, music, images and
          trademarks only with the rights you need. Disclose a sponsored
          relationship clearly and honor any accepted licensing terms.
        </p>
      </Section>
      <Section title="Reporting and account controls">
        <p>
          Report concerning posts through their menu. You can block an account
          to restrict interactions and visibility. Operators can remove content
          or restrict access when reviewing abuse. Contact support if you need
          to provide additional context or question a moderation decision.
        </p>
        <Contact subject="Sidequest community concern" />
      </Section>
    </>
  );
}

const pages: Record<string, { title: string; component: () => ReactNode }> = {
  "/privacy": { title: "Privacy policy", component: PrivacyPolicy },
  "/support": { title: "Help & support", component: Support },
  "/terms": { title: "Terms of use", component: Terms },
  "/community-guidelines": {
    title: "Community guidelines",
    component: CommunityGuidelines,
  },
};

export default function PublicInformation() {
  const { pathname } = useLocation();
  const page = pages[pathname.replace(/\/+$/, "")] || pages["/support"];
  const Content = page.component;
  useEffect(() => {
    const previous = document.title;
    document.title = `${page.title} · Sidequest`;
    return () => {
      document.title = previous;
    };
  }, [page.title]);
  return (
    <article className="information-page">
      <Link className="information-back" to="/discover">
        <ArrowLeft size={18} aria-hidden="true" /> Back to Sidequest
      </Link>
      <header className="information-heading">
        <p className="eyebrow">SIDEQUEST · YOUR STORY, YOUR CALL</p>
        <h1>{page.title}</h1>
        <p className="information-updated">Updated {POLICY_UPDATED}</p>
      </header>
      <Content />
      <nav className="information-footer" aria-label="Help and policies">
        {INFORMATION_LINKS.map(({ path, label }) => (
          <Link
            key={path}
            to={path}
            aria-current={path === pathname ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
    </article>
  );
}
