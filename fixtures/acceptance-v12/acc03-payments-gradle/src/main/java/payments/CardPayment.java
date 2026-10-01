package payments;

public class CardPayment implements PaymentMethod {
  int authorisations;

  @Override
  public int charge(int amountCents) {
    authorisations = authorisations + 1;
    return amountCents + surchargeCents(amountCents);
  }
}
