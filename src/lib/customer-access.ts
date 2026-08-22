type CustomerAccessShape = {
  status?: string | null
  creditStatus?: string | null
  creditLimit?: number | null
  creditBalance?: number | null
}

export function getCustomerLoginBlockReason(customer?: CustomerAccessShape | null) {
  if (!customer) {
    return "Customer account not found."
  }

  if (customer.status === "blocked") {
    return "Your account has been blocked. Please contact support."
  }

  if (customer.status === "inactive") {
    return "Your account is currently inactive. Please contact support."
  }

  return null
}

export function getCustomerOrderBlockReason(
  customer?: CustomerAccessShape | null,
  orderTotal?: number | null
) {
  const loginBlock = getCustomerLoginBlockReason(customer)
  if (loginBlock) {
    return loginBlock
  }

  if (customer?.creditStatus === "stopped") {
    return "Ordering is disabled for your account. Please contact support."
  }

  if (customer?.creditStatus === "on_hold") {
    return "Ordering is currently on hold for your account until the credit review is resolved."
  }

  const nextOrderTotal = Number(orderTotal)
  if (
    customer &&
    customer.creditLimit &&
    customer.creditLimit > 0 &&
    Number.isFinite(nextOrderTotal) &&
    nextOrderTotal > 0 &&
    (customer.creditBalance || 0) + nextOrderTotal > customer.creditLimit
  ) {
    return "This order exceeds the available credit limit for your account."
  }

  return null
}

export function getCustomerOrderingStatus(customer?: CustomerAccessShape | null) {
  const orderingMessage = getCustomerOrderBlockReason(customer)
  return {
    orderingEnabled: !orderingMessage,
    orderingMessage,
  }
}
