package payments;

public class WalletPayment implements PaymentMethod {
  int balanceCents = 5000;

  @Override
  public int charge(int amountCents) {
    int taken = Math.min(balanceCents, amountCents);
    balanceCents = balanceCents - taken;
    return taken;
  }

  @Override
  public int surchargeCents(int amountCents) {
    return 0;
  }
}
