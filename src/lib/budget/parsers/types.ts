export type Parsed = {
  amount: number;
  merchant: string;
  date: string;            // YYYY-MM-DD (KST)
  payment_method: string;
};

export type ParseFn = (text: string, smsDate: Date) => Parsed | null;
