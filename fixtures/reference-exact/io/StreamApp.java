import java.util.Scanner;

public class StreamApp {
    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);
        System.out.println("READY");
        int quantity = input.nextInt();
        System.out.println("OUT " + quantity);
        System.err.println("CHECK " + quantity);
    }
}
