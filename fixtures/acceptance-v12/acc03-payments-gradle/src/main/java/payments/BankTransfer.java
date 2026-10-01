package payments;

public class BankTransfer implements PaymentMethod {
  int batchedTransfers;

  @Override
  public int charge(int amountCents) {
    batchedTransfers = batchedTransfers + 1;
    return amountCents - 50;
  }
}
