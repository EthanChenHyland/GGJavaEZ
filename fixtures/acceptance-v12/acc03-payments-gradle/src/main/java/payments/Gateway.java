package payments;

public class Gateway {
  final CardPayment card = new CardPayment();
  final WalletPayment wallet = new WalletPayment();
  final BankTransfer transfer = new BankTransfer();
  int routedCount;

  PaymentMethod choose(char code) {
    switch (code) {
      case 'C': return card;
      case 'W': return wallet;
      default: return transfer;
    }
  }

  int settle(PaymentMethod method, int amountCents) {
    routedCount = routedCount + 1;
    int collected = method.charge(amountCents);
    return collected;
  }
}
