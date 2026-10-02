import { Link } from "react-router-dom";
import {
  BookOpen,
  BriefcaseBusiness,
  ChevronRight,
  Settings2,
  ShieldCheck,
  FlaskConical,
  SlidersHorizontal,
  CircleHelp,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { useCommunity, useCommunityAction } from "../components/Community";
import { PageTitle, Notice, Button, Back } from "../components/ui";
import { DEMO } from "../lib/auth";
import { hasBusinessWorkspace } from "../../shared/account";
import {
  DEMO_PEOPLE,
  demoPersona,
  switchDemoPersona,
  type DemoPersona,
} from "../lib/demo-identity";
import "./settings.css";

function SettingsRow({
  to,
  title,
  description,
  icon: Icon,
}: {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link className="settings-row" to={to}>
      <span className="settings-row-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <span className="settings-row-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <ChevronRight
        className="settings-row-chevron"
        size={18}
        aria-hidden="true"
      />
    </Link>
  );
}

export default function Settings() {
  const me = useCommunity("me");
  const action = useCommunityAction(me.refresh);
  const business = me.data ? hasBusinessWorkspace(me.data) : Boolean(me.error);
  const admin = me.data
    ? me.data.roles.includes("operator")
    : Boolean(me.error);
  return (
    <div className="settings-page">
      <Back to="/profile">Profile</Back>
      <PageTitle title="Settings">Account, privacy and preferences.</PageTitle>
      <nav className="settings-navigation" aria-label="Settings">
        <section className="settings-group" aria-labelledby="settings-account">
          <h2 id="settings-account">Your account</h2>
          <div className="settings-group-rows">
            <SettingsRow
              to="/account/security"
              icon={Settings2}
              title="Account settings"
              description="Sign-in, privacy & security"
            />
            <SettingsRow
              to="/account"
              icon={SlidersHorizontal}
              title="Account & quest preferences"
              description="Interests, boundaries & ChatGPT"
            />
            <SettingsRow
              to="/journal"
              icon={BookOpen}
              title="Private journal"
              description="Your private quests & videos"
            />
          </div>
        </section>
        <section className="settings-group" aria-labelledby="settings-help">
          <h2 id="settings-help">Help & policies</h2>
          <div className="settings-group-rows">
            <SettingsRow
              to="/support"
              icon={CircleHelp}
              title="Help & support"
              description="Contact us or report a concern"
            />
            <SettingsRow
              to="/privacy"
              icon={ShieldCheck}
              title="Privacy policy"
              description="Your data, permissions & choices"
            />
            <SettingsRow
              to="/terms"
              icon={FileText}
              title="Terms of use"
              description="How Sidequest works"
            />
            <SettingsRow
              to="/community-guidelines"
              icon={BookOpen}
              title="Community guidelines"
              description="Respect, consent & safe challenges"
            />
          </div>
        </section>
        {(business || admin) && (
          <section
            className="settings-group"
            aria-labelledby="settings-workspaces"
          >
            <h2 id="settings-workspaces">Workspaces</h2>
            <div className="settings-group-rows">
              {business && (
                <SettingsRow
                  to="/business"
                  icon={BriefcaseBusiness}
                  title="Business workspace"
                  description={
                    me.data
                      ? "Business & licensed videos"
                      : "For business accounts"
                  }
                />
              )}
              {admin && (
                <SettingsRow
                  to="/admin"
                  icon={ShieldCheck}
                  title="Admin"
                  description={
                    me.data ? "Approvals & reports" : "For operator accounts"
                  }
                />
              )}
              {me.data?.roles.includes("operator") && (
                <SettingsRow
                  to="/operator"
                  icon={ShieldCheck}
                  title="Operator tools"
                  description="Quest reviews & funded offers"
                />
              )}
            </div>
          </section>
        )}
        {DEMO && (
          <section className="settings-group" aria-labelledby="settings-demo">
            <h2 id="settings-demo">Local demo</h2>
            <div className="settings-group-rows">
              <SettingsRow
                to="/settings/demo-tools"
                icon={FlaskConical}
                title="Demo tools"
                description="Test identities · no real payments"
              />
            </div>
          </section>
        )}
      </nav>
      {Boolean(me.data?.blocks.length) && (
        <details className="community-panel settings-blocks">
          <summary>Blocked accounts · {me.data!.blocks.length}</summary>
          {me.data!.blocks.map((userId) => (
            <div className="post-secondary settings-blocked-row" key={userId}>
              <span>Account {userId.slice(0, 8)}</span>
              <Button
                secondary
                busy={action.busy}
                onClick={() =>
                  action.run(
                    "block",
                    { userId, blocked: false },
                    "Account unblocked.",
                  )
                }
              >
                Unblock
              </Button>
            </div>
          ))}
        </details>
      )}
      {action.feedback}
      {me.error && (
        <div className="settings-recovery">
          <Notice error>{me.error}</Notice>
          <Button secondary onClick={me.refresh}>
            Retry account settings
          </Button>
        </div>
      )}
    </div>
  );
}

export function DemoTools() {
  if (!DEMO)
    return (
      <>
        <PageTitle title="Demo tools unavailable" />
        <p>This account uses your signed-in identity.</p>
        <Link to="/settings">Back to settings</Link>
      </>
    );
  return (
    <div className="settings-page">
      <Link className="back" to="/settings">
        ← Settings
      </Link>
      <PageTitle title="Demo tools">
        Try the local app from another demonstration identity.
      </PageTitle>
      <Notice>
        Local demo only. These accounts, business approvals, payments, and
        rewards are simulated. Switching views does not change a real account’s
        permissions.
      </Notice>
      <section className="demo-tools-panel" aria-label="Local demo identities">
        <label>
          Demo view
          <select
            value={demoPersona()}
            onChange={(event) =>
              switchDemoPersona(event.target.value as DemoPersona)
            }
          >
            {Object.entries(DEMO_PEOPLE).map(([key, person]) => (
              <option key={key} value={key}>
                {person.role}
              </option>
            ))}
          </select>
        </label>
        <p className="support">
          Your current demo identity is {DEMO_PEOPLE[demoPersona()].name}.
          Switching keeps each identity’s saved records and returns you to
          Discover.
        </p>
      </section>
    </div>
  );
}
