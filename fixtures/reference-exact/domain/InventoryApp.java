import java.util.ArrayList;
import java.util.List;

public class InventoryApp {
    public static void main(String[] args) {
        StockItem notebook = new StockItem("Notebook");
        StockItem tools = new StockItem("tools");
        notebook.related = tools;
        notebook.tags.add("paper");
        notebook.tags.add("office");
        notebook.tags.add("blue");
        notebook.setQuantity(18);
        System.out.println("QTY " + notebook.quantity);
        System.out.println("TAGS " + notebook.tags.size());
        System.out.println("LINK " + notebook.related.label);
    }
}

class StockItem {
    String label;
    int quantity;
    List<String> tags;
    StockItem related;

    StockItem(String label) {
        this.label = label;
        this.tags = new ArrayList<>();
    }

    void setQuantity(int quantity) {
        this.quantity = quantity;
    }
}
