import java.util.Scanner;

public class IoMain {
    static void leaf(int magnitude) {
        if (magnitude > 0) throw new IllegalArgumentException("rejected");
    }
    static void middle(int forwarded) { leaf(forwarded); }
    public static void main(String[] args) {
        Scanner reader = new Scanner(System.in);
        int consumed = reader.nextInt();
        System.out.println(consumed);
        System.err.print("audit");
        try { middle(consumed); }
        catch (IllegalArgumentException issue) { System.out.println("handled"); }
        System.out.println("finished");
    }
}
