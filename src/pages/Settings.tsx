import { Link } from "react-router-dom";
import {
  BookOpen,
  BriefcaseBusiness,
  ChevronRight,
  Settings2,
  ShieldCheck,
  FlaskConical,
} from "lucide-react";
import { useCommunity, useCommunityAction } from "../components/Community";
import { PageTitle, Notice, Button } from "../components/ui";
import { DEMO } from "../lib/auth";
import { hasBusinessWorkspace } from "../../shared/account";
import {
  DEMO_PEOPLE,
  demoPersona,
  switchDemoPersona,
  type DemoPersona,
} from "../lib/demo-identity";

export default function Settings() {
  const me = useCommunity("me");
  const action = useCommunityAction(me.refresh);
  return (
    <div className="settings-page">
      <PageTitle title="Settings">
        Your account, preferences, and workspaces.
      </PageTitle>
      <nav className="settings-list" aria-label="Settings">
        <Link to="/account">
          <Settings2 />
          <span>
            <strong>Account settings</strong>
            <small>Preferences, privacy, and your imported summary</small>
          </span>
          <ChevronRight />
        </Link>
        <Link to="/journal">
          <BookOpen />
          <span>
            <strong>Private journal</strong>
            <small>Your saved quests and videos</small>
          </span>
          <ChevronRight />
        </Link>
        {(me.data ? hasBusinessWorkspace(me.data) : Boolean(me.error)) && (
          <Link to="/business">
            <BriefcaseBusiness />
            <span>
              <strong>Business workspace</strong>
              <small>
                {me.data
                  ? "Business setup and licensed videos"
                  : "Opens if your account has a business"}
              </small>
            </span>
            <ChevronRight />
          </Link>
        )}
        {(me.data ? me.data.roles.includes("operator") : Boolean(me.error)) && (
          <Link to="/admin">
            <ShieldCheck />
            <span>
              <strong>Admin</strong>
              <small>
                {me.data
                  ? "Approvals, reports, and manual verification"
                  : "Opens if your account is an operator"}
              </small>
            </span>
            <ChevronRight />
          </Link>
        )}
        {DEMO && (
          <Link to="/settings/demo-tools">
            <FlaskConical />
            <span>
              <strong>Demo tools</strong>
              <small>Local demonstration identities. No real payments.</small>
            </span>
            <ChevronRight />
          </Link>
        )}
      </nav>
      {Boolean(me.data?.blocks.length) && (
        <details className="community-panel">
          <summary>Blocked accounts · {me.data!.blocks.length}</summary>
          {me.data!.blocks.map((userId) => (
            <div className="post-secondary" key={userId}>
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
        <>
          <Notice error>{me.error}</Notice>
          <Button secondary onClick={me.refresh}>
            Retry account settings
          </Button>
        </>
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
