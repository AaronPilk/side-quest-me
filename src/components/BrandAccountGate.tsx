import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { hasBusinessWorkspace } from "../../shared/account";
import { useCommunity } from "./Community";
import { Button, Loading, Notice } from "./ui";

export function BrandAccountGate({ children }: { children: ReactNode }) {
  const account = useCommunity("me");
  if (account.error)
    return (
      <>
        <Notice error>{account.error}</Notice>
        <Button secondary onClick={account.refresh}>
          Retry account access
        </Button>
      </>
    );
  if (!account.data) return <Loading />;
  if (!hasBusinessWorkspace(account.data))
    return <Navigate to="/account" replace />;
  return children;
}
