// Customer-scoped operations shared with the hosted portal's GraphQL contract.
// Source: lago/front/src/components/customerPortal and pages/customerPortal.
export type Cents = string | number;
export interface Page<T> {
  collection: T[];
  metadata: { currentPage: number; totalPages: number; totalCount?: number };
}
export interface Address {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  country: string | null;
}
export interface Customer extends Address {
  id: string;
  name: string | null;
  firstname: string | null;
  lastname: string | null;
  customerType: "company" | "individual" | null;
  email: string | null;
  legalName: string | null;
  taxIdentificationNumber: string | null;
  currency: string | null;
  applicableTimezone: string;
  shippingAddress: Address | null;
}
export interface Identity {
  customerPortalUser: Customer;
  customerPortalOrganization: { id: string; name: string };
}
export interface Subscription {
  id: string;
  externalId: string;
  status: string;
  endingAt: string | null;
  nextSubscription: {
    id: string;
    status: string;
    plan: { name: string };
  } | null;
  name: string | null;
  currentBillingPeriodEndingAt: string | null;
  plan: {
    id: string;
    name: string;
    invoiceDisplayName: string | null;
    code: string;
    amountCents: Cents;
    amountCurrency: string;
    interval: string;
  };
}
export interface Usage {
  amountCents: Cents;
  currency: string;
  fromDatetime: string;
  toDatetime: string;
  chargesUsage: {
    id: string;
    units: string | number;
    amountCents: Cents;
    charge: { id: string; invoiceDisplayName: string | null } | null;
    feature: { id: string; code: string; name: string } | null;
  }[];
}
export interface Invoice {
  id: string;
  number: string;
  issuingDate: string;
  totalAmountCents: Cents;
  totalDueAmountCents: Cents;
  currency: string;
  paymentStatus: string;
  paymentOverdue: boolean;
  paymentDisputeLostAt: string | null;
}
export interface Wallet {
  id: string;
  name: string | null;
  currency: string;
  balanceCents: Cents;
  creditsBalance: number;
  consumedCredits: number;
  expirationAt: string | null;
  rateAmount: number;
  paidTopUpMinAmountCents: Cents | null;
  paidTopUpMaxAmountCents: Cents | null;
}
export const identityQuery = `query SdkPortalIdentity {
  customerPortalUser { id name firstname lastname customerType email legalName
    taxIdentificationNumber currency applicableTimezone
    addressLine1 addressLine2 city state zipcode country
    shippingAddress { addressLine1 addressLine2 city state zipcode country }
  }
  customerPortalOrganization { id name }
}`;
export const subscriptionsQuery = `query SdkPortalSubscriptions($page: Int) {
  customerPortalSubscriptions(status: [active], limit: 20, page: $page) {
    metadata { currentPage totalPages }
    collection { id externalId status endingAt name currentBillingPeriodEndingAt
      nextSubscription { id status plan { name } }
      plan { id name invoiceDisplayName code amountCents amountCurrency interval }
    }
  }
}`;
export const subscriptionQuery = `query SdkPortalSubscription($id: ID!) {
  customerPortalSubscription(id: $id) {
    id externalId status endingAt name currentBillingPeriodEndingAt
    nextSubscription { id status plan { name } }
    plan { id name invoiceDisplayName code amountCents amountCurrency interval }
  }
}`;
export const usageQuery = `query SdkPortalUsage($subscriptionId: ID!) {
  customerPortalCustomerUsage(subscriptionId: $subscriptionId) {
    amountCents currency fromDatetime toDatetime
    chargesUsage { id units amountCents charge { id invoiceDisplayName } feature { id code name } }
  }
}`;
export const invoicesQuery = `query SdkPortalInvoices($page: Int, $searchTerm: String) {
  customerPortalInvoices(status: [finalized], limit: 8, page: $page, searchTerm: $searchTerm) {
    metadata { currentPage totalPages totalCount }
    collection { id number issuingDate totalAmountCents totalDueAmountCents currency
      paymentStatus paymentOverdue paymentDisputeLostAt }
  }
}`;
export const walletsQuery = `query SdkPortalWallets($page: Int) {
  customerPortalWallets(status: active, limit: 10, page: $page) {
    metadata { currentPage totalPages }
    collection { id name currency balanceCents creditsBalance consumedCredits expirationAt rateAmount
      paidTopUpMinAmountCents paidTopUpMaxAmountCents }
  }
}`;
export const updateCustomerMutation = `mutation SdkPortalUpdateCustomer($input: UpdateCustomerPortalCustomerInput!) {
  updateCustomerPortalCustomer(input: $input) { id }
}`;
export const downloadInvoiceMutation = `mutation SdkPortalDownloadInvoice($input: DownloadCustomerPortalInvoiceInput!) {
  downloadCustomerPortalInvoice(input: $input) { id fileUrl }
}`;
export const topUpMutation = `mutation SdkPortalTopUp($input: CreateCustomerPortalWalletTransactionInput!) {
  createCustomerPortalWalletTransaction(input: $input) { collection { id } }
}`;
