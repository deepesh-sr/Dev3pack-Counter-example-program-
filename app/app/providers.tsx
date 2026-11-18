"use client";

import { ClientProvider } from "@solana/react";
import type { ReactNode } from "react";
import { client } from "@/lib/client";

export function Providers({ children }: { children: ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>;
}
