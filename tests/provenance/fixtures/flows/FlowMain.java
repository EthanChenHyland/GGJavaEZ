public class FlowMain {
    interface Payment { void deposit(int amount); }
    static class Ledger implements Payment {
        int balance;
        Ledger(int opening) { balance = opening; }
        public void deposit(int amount) { balance = amount; }
        void deposit(int amount, int extra) { balance = amount + extra; }
        void set(int replacement) { balance = replacement; }
        void add(int increment) { balance += increment; }
    }
    static int answer() { return 42; }
    static int left() { return 5; }
    static int right() { return 7; }
    static Ledger identity(Ledger original) { return original; }
    static Ledger none() { return null; }
    static void consume(int incoming) { int copied = incoming; System.out.println(copied); }
    static int walk(int remaining) {
        if (remaining == 0) return 0;
        return remaining + walk(remaining - 1);
    }
    public static void main(String[] args) {
        Ledger ledger = new Ledger(2);
        int callerValue = 25;
        Payment payment = ledger;
        payment.deposit(callerValue);
        ledger.deposit(25);
        ledger.deposit(callerValue / 2);
        ledger.deposit(3, 4);
        int a = 10;
        int b = a;
        int c = a + 5;
        ledger.set(callerValue);
        ledger.add(3);
        int result = answer();
        int combined = left() + right();
        consume(answer());
        Ledger returned = identity(ledger);
        Ledger absent = none();
        Ledger alias = returned;
        Ledger alias2 = alias;
        int[] cells = {1, 2};
        cells[0] = result;
        int indexed = cells[0];
        cells[1] = indexed + 1;
        int walkResult = walk(4);
        System.out.println(result);
        System.out.println(combined);
        System.out.println(indexed);
        System.out.println(cells[1]);
        System.out.println(walkResult);
        System.out.println(ledger.balance);
    }
}
