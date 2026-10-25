public class HoverOrigins {
    static final class Item {
        Item link;
        int value;
        Item(int value) { this.value = value; }
    }

    static Item shared;

    public static void main(String[] args) {
        Item a = new Item(7);
        Item b = new Item(9);
        shared = a;
        a.link = b;
        Item[] slots = new Item[10001];
        slots[6500] = b;
        System.out.println(shared.value + ":" + slots[6500].value);
    }
}
