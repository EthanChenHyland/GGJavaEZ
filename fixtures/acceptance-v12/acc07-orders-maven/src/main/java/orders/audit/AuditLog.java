package orders.audit;

public class AuditLog {
  private int entries;
  private int lastQuantity;

  public void record(String item, int quantity) {
    entries = entries + 1;
    lastQuantity = quantity;
  }

  public int entryCount() {
    return entries;
  }
}
