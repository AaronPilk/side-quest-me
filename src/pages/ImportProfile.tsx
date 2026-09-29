import { useEffect, useState } from "react";
import type { Profile } from "../../shared/domain";
import { api } from "../lib/api";
import SummaryReview from "../components/SummaryReview";
import { Back, Loading, Notice, PageTitle } from "../components/ui";

export default function ImportProfile() {
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
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
  }, []);
  if (!profile) return error ? <Notice error>{error}</Notice> : <Loading />;
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
