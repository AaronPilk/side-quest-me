import { useRef, useState } from "react";
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
  const [token, setToken] = useState<{ id: string; value: string }>();
  const [message, setMessage] = useState("");
  const running = useRef(false);
  const pendingReservations = useRef(new Map<string, string>());
  async function redeem() {
    if (!selected || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setToken(undefined);
    const fingerprint = `${selected.id}:${selected.version}`;
    const key =
      pendingReservations.current.get(fingerprint) ?? crypto.randomUUID();
    pendingReservations.current.set(fingerprint, key);
    try {
      const result = await api.redeem(selected.id, selected.version!, key);
      // Retrying an uncertain request reuses its key. An acknowledged reservation
      // ends that attempt, so another reward cannot replay the previous one.
      pendingReservations.current.delete(fingerprint);
      setSelected(undefined);
      setConfirming(false);
      me.refresh();
      offers.refresh();
      redemptions.refresh();
      setMessage("Reward reserved. Your points balance has been updated.");
      try {
        const material = await api.redemptionToken(result.id);
        setToken({ id: result.id, value: material.token });
      } catch {
        setError(
          "Your reward is reserved, but its private code could not load. Use Show private code below to try again.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  if (selected)
    return (
      <>
        <button
          className="back"
          disabled={busy}
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
            <Button
              secondary
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Go back
            </Button>
          </>
        ) : (
          <Button
            disabled={
              !me.data ||
              Boolean(me.error) ||
              me.data.wallet.points < selected.points
            }
            onClick={() => setConfirming(true)}
          >
            Redeem {selected.points} points
          </Button>
        )}
        {!selected.demo &&
          me.data &&
          me.data.wallet.points < selected.points && (
            <p className="support">
              You need {selected.points - me.data.wallet.points} more points for
              this reward.
            </p>
          )}
        {me.error && (
          <Notice error>
            {me.error}{" "}
            <button className="text-button" onClick={me.refresh}>
              Retry points balance
            </button>
          </Notice>
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
      {message && <Notice>{message}</Notice>}
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
                  setMessage("");
                  setToken(undefined);
                }}
                disabled={busy}
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
                    busy={busy}
                    onClick={async () => {
                      if (running.current) return;
                      running.current = true;
                      setBusy(true);
                      setError("");
                      setToken(undefined);
                      try {
                        setToken({
                          id: r.id,
                          value: (await api.redemptionToken(r.id)).token,
                        });
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        running.current = false;
                        setBusy(false);
                      }
                    }}
                  >
                    Show private code
                  </Button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      if (running.current) return;
                      if (
                        !confirm(
                          "Cancel this reservation and return its points?",
                        )
                      )
                        return;
                      running.current = true;
                      setBusy(true);
                      setError("");
                      try {
                        await api.cancelRedemption(r.id);
                        if (token?.id === r.id) setToken(undefined);
                        setMessage(
                          "Reservation canceled. Its points have been returned.",
                        );
                        redemptions.refresh();
                        me.refresh();
                        offers.refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        running.current = false;
                        setBusy(false);
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
              value={token.value}
              aria-label="Private redemption token"
            />
            <Button secondary onClick={() => setToken(undefined)}>
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
      {(offers.error || redemptions.error || me.error) && (
        <Button
          secondary
          onClick={() => {
            me.refresh();
            offers.refresh();
            redemptions.refresh();
          }}
        >
          Retry perks
        </Button>
      )}
    </>
  );
}
