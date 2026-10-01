package orders.app;

import orders.api.OrderController;

public class Main {
  public static void main(String[] args) {
    OrderController controller = OrderController.assemble();
    int firstTotal = controller.submit("lamp", 2);
    int secondTotal = controller.submit("desk", 1);
    System.out.println("TOTALS " + firstTotal + " " + secondTotal);
    System.out.println("AUDITED " + controller.auditedEntries());
  }
}
