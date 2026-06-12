export interface Profile {
  id: string
  email: string
  username: string
  status: string
  locale: string
  payment_link?: string | null
  phone_number?: string | null
  iban?: string | null
  push_subscription?: any
}

export interface ExpenseBeneficiary {
  id: string
  expense_id: string
  profile_id: string
  parts: string | number
  profiles?: Profile | null
}

export interface Expense {
  id: string
  group_id: string
  description: string
  amount: string | number
  paid_by: string
  is_pending: boolean
  created_at?: string
  deleted_at?: string | null
  profiles?: Profile | null
  expense_beneficiaries: ExpenseBeneficiary[]
}

export interface GroupMember {
  group_id: string
  profile_id: string
  note?: string
  profiles?: Profile | null
}

export interface Group {
  id: string
  name: string
  created_by: string
  group_members?: GroupMember[]
  expenses?: Expense[]
}

export interface ActiveGroup {
  id: string
  name: string
  createdBy: string
  members: Array<Profile & { note?: string }>
  expenses: Expense[]
}

export interface Session {
  access_token: string
  user: {
    id: string
    email: string
  }
}

export interface ConfirmState {
  isOpen: boolean
  title: string
  message: string
  resolve: ((value: boolean) => void) | null
  reject: (() => void) | null
  confirmText: string
  cancelText: string
}

export interface AlertState {
  isOpen: boolean
  title: string
  message: string
  resolve: (() => void) | null
  okText: string
}

export interface ImpersonatingFrom {
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
}

export interface State {
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
  isRecovery: boolean
  groups: any[]
  profiles: Profile[]
  activeGroup: ActiveGroup | null
  loading: boolean
  error: string | null
  connectionError: string | null
  isInitialized: boolean
  impersonatingFrom: ImpersonatingFrom | null
  confirmState: ConfirmState
  alertState: AlertState
}

export interface SettlementTransaction {
  fromId: string
  fromName: string
  toId: string
  toName: string
  amount: number
  paymentLink: string
  phoneNumber: string
  iban: string
}

export interface SettlementResult {
  balances: { profileId: string; netBalance: number }[]
  transactions: SettlementTransaction[]
}
