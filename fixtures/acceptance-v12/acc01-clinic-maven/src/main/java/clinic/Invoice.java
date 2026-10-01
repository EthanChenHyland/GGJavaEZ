package clinic;

public class Invoice {
  static int issued;
  final Patient payer;
  final int cents;

  Invoice(Patient payer, int cents) {
    this.payer = payer;
    this.cents = cents;
    issued = issued + 1;
  }
}
