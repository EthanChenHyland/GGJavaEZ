public class PauseApp {
    public static void main(String[] args) {
        Bin bin = new Bin();
        int next = 18;
        bin.quantity = next;
        System.out.println("BIN " + bin.quantity);
    }
}

class Bin {
    int quantity;
}
