package payments;

public class Main {
  public static void main(String[] args) {
    Gateway gateway = new Gateway();
    String plan = "CWBCW";
    int settled = 0;
    for (int index = 0; index < plan.length(); index++) {
      PaymentMethod method = gateway.choose(plan.charAt(index));
      settled = settled + gateway.settle(method, 1000 + index * 250);
    }
    System.out.println("SETTLED " + settled);
    System.out.println("ROUTES " + gateway.routedCount);
  }
}
