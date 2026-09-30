import { useEffect, useState } from "react";
import type { Profile } from "../../shared/domain";
import { api } from "../lib/api";
import SummaryReview from "../components/SummaryReview";
import { Back, Button, Loading, Notice, PageTitle } from "../components/ui";

export default function ImportProfile() {
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    api
      .me()
      .then((data) => {
        if (active) setProfile(data.profile);
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  if (!profile)
    return error ? (
      <>
        <Back to="/account">Account & preferences</Back>
        <Notice error>{error}</Notice>
        <Button secondary onClick={() => setRetry((value) => value + 1)}>
          Retry profile
        </Button>
      </>
    ) : (
      <Loading />
    );
  return (
    <div className="import-profile">
      <Back to="/account">Account & preferences</Back>
      <PageTitle title="Make your context useful.">
        Edit your summary and confirm what should guide your quests.
      </PageTitle>
      <SummaryReview
        profile={profile}
        onSaved={(patch) =>
          setProfile((current) =>
            current ? { ...current, ...patch } : current,
          )
        }
      />
    </div>
  );
}
