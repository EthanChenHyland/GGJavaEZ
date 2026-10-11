import java.util.ArrayList;
import java.util.List;
import warehouse.Crate;
import warehouse.Pallet;
import catalog.Label;
import catalog.Tag;

public class InventoryWorld {
    public static void main(String[] args) {
        List<Object> items = new ArrayList<>();
        for (int index = 0; index < 12; index++) {
            items.add(new Crate(index));
            items.add(new Pallet(index));
            items.add(new Label(index));
            items.add(new Tag(index));
            items.add(new Shelf(index));
            items.add(new Rack(index));
        }
        int[] quantities = new int[32];
        quantities[31] = items.size();
        System.out.println("WORLD " + quantities[31]);
    }
}

class Shelf {
    int index;
    Shelf(int index) { this.index = index; }
}
class Rack {
    int index;
    Rack(int index) { this.index = index; }
}
