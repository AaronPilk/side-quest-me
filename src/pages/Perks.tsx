import { useState } from "react";
import {
  Coffee,
  Utensils,
  Ticket,
  ArrowUpRight,
  Gift,
  ArrowLeft,
} from "lucide-react";
import { api } from "../lib/api";
import { DEMO } from "../lib/auth";
import type { Offer } from "../lib/types";
import {
  Button,
  PageTitle,
  Notice,
  Empty,
  Loading,
  useResource,
} from "../components/ui";
export default function Perks() {
  const me = useResource(api.me);
  const offers = useResource(api.offers);
  const redemptions = useResource(api.redemptions);
  const [selected, setSelected] = useState<Offer>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [key] = useState(crypto.randomUUID());
  async function redeem() {
    setBusy(true);
    setError("");
    try {
      const result = await api.redeem(selected!.id, selected!.version!, key);
      setSelected(undefined);
      setConfirming(false);
      me.refresh();
      redemptions.refresh();
      const material = await api.redemptionToken(result.id);
      setToken(material.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (selected)
    return (
      <>
        <button
          className="back"
          onClick={() => {
            setSelected(undefined);
            setConfirming(false);
          }}
        >
          <ArrowLeft size={18} />
          Rewards
        </button>
        <div className="reward-detail-art">
          <Gift size={64} />
        </div>
        <PageTitle
          eyebrow={selected.demo ? "SIMULATED EXAMPLE" : selected.merchant}
          title={selected.title}
        />
        <h2>{selected.points} reward points</h2>
        <p className="lead">{selected.merchant}</p>
        <section className="section">
          <h2>Know before you redeem</h2>
          <p>{selected.terms}</p>
          {selected.location && <p>{selected.location}</p>}
          {selected.expiresAt && (
            <p>Expires {new Date(selected.expiresAt).toLocaleString()}</p>
          )}
        </section>
        {selected.demo ? (
          <Notice>
            This is an example only. No points are spent, no inventory is
            reserved, and no code is issued.
          </Notice>
        ) : confirming ? (
          <>
            <Notice>
              Your points: {me.data?.wallet.points || 0} →{" "}
              {(me.data?.wallet.points || 0) - selected.points}. XP stays
              unchanged. This reserves the offer; the merchant confirms
              fulfillment.
            </Notice>
            <Button busy={busy} onClick={redeem}>
              Confirm · Redeem {selected.points} points
            </Button>
            <Button secondary onClick={() => setConfirming(false)}>
              Go back
            </Button>
          </>
        ) : (
          <Button
            disabled={(me.data?.wallet.points || 0) < selected.points}
            onClick={() => setConfirming(true)}
          >
            Redeem {selected.points} points
          </Button>
        )}
        {error && <Notice error>{error}</Notice>}
      </>
    );
  const Icons = [Ticket, Coffee, Utensils, Gift];
  return (
    <>
      <p className="support">
        Earn progress for showing up. Spend quest points on participating
        rewards.
      </p>
      <div className="wallet-card">
        <div>
          <span>
            {DEMO ? "SIMULATED AVAILABLE POINTS" : "AVAILABLE REWARD POINTS"}
          </span>
          <strong>
            {me.data?.wallet.points ?? "—"}
            <small>points</small>
          </strong>
        </div>
        <Gift size={38} />
        <p>XP is your progress. Points are yours to spend.</p>
      </div>
      {DEMO ? (
        <Notice>
          Demo catalog · These fictional examples cannot be redeemed. Live
          offers only appear after a real partner funds them.
        </Notice>
      ) : (
        <p className="support">
          Real offers from participating businesses in the configured launch
          area.
        </p>
      )}
      <section className="section">
        <div className="section-heading">
          <h2>{DEMO ? "A taste of what’s possible" : "Available rewards"}</h2>
          {DEMO && <span className="pill">Examples</span>}
        </div>
        {offers.data?.length === 0 && (
          <Empty title="Rewards are coming to this area">
            Your earned points stay in your wallet. There are no funded offers
            here yet.
          </Empty>
        )}
        {!offers.data && !offers.error && <Loading />}
        <div className="reward-list">
          {offers.data?.map((o, i) => {
            const Icon = Icons[i % Icons.length];
            return (
              <button
                className="reward-card"
                key={o.id}
                onClick={() => {
                  setSelected(o);
                  setError("");
                }}
              >
                <div className={`reward-icon reward-color-${i % 4}`}>
                  <Icon size={28} />
                </div>
                <div>
                  <small>
                    {o.demo ? "DEMO · " : ""}
                    {o.merchant}
                  </small>
                  <h3>{o.title}</h3>
                  <span>{o.points} points</span>
                </div>
                <div className="reward-card-action">
                  <ArrowUpRight size={20} />
                  <small>{o.demo ? "View demo" : "View terms"}</small>
                </div>
              </button>
            );
          })}
        </div>
      </section>
      <section className="section">
        <h2>My rewards</h2>
        {redemptions.error ? null : !redemptions.data ? (
          <Loading />
        ) : redemptions.data.length ? (
          redemptions.data.map((r) => (
            <div className="redemption" key={r.id}>
              <h3>{r.title}</h3>
              <span className="pill">{r.state}</span>
              <p>
                {r.points} points · Expires{" "}
                {new Date(r.expiresAt).toLocaleString()}
              </p>
              {r.state === "reserved" && (
                <div className="button-row">
                  <Button
                    secondary
                    onClick={async () => {
                      try {
                        setToken((await api.redemptionToken(r.id)).token);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Show private code
                  </Button>
                  <button
                    className="text-button"
                    onClick={async () => {
                      if (
                        !confirm(
                          "Cancel this reservation and return its points?",
                        )
                      )
                        return;
                      try {
                        await api.cancelRedemption(r.id);
                        redemptions.refresh();
                        me.refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Cancel & refund
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="support">
            Your reserved and used rewards will appear here.
          </p>
        )}
        {token && (
          <div className="private-token">
            <h3>Show only to the merchant</h3>
            <p className="support">This token is private and single use.</p>
            <textarea
              readOnly
              value={token}
              aria-label="Private redemption token"
            />
            <Button secondary onClick={() => setToken("")}>
              Hide code
            </Button>
          </div>
        )}
      </section>
      {(error || offers.error || redemptions.error || me.error) && (
        <Notice error>
          {error || offers.error || redemptions.error || me.error}
        </Notice>
      )}
    </>
  );
}
