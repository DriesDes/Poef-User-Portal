export type PortalProfile = {
  naam: string;
  tak: string | null;
  saldo: string | null;
  strippen: number;
  updatedAt: string | null;
};

export type PortalTransaction = {
  id: string;
  timestamp: string;
  type: string;
  amountLabel: string;
  description: string;
};

export type PortalPayload = {
  profile: PortalProfile;
  transactions: PortalTransaction[];
};

export type SessionPersistence = "day" | "week" | "month" | "year" | "forever";

