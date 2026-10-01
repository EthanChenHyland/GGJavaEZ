package payments;

public interface PaymentMethod {
  int charge(int amountCents);

  default int surchargeCents(int amountCents) {
    return amountCents / 100;
  }
}
