public class Main {
    public static void main(String[] args) {
        int denominator = 0;
        try {
            int x = 10 / denominator;
            System.out.println(x);
        } catch (ArithmeticException e) {
            System.out.println("recovered");
        }
        System.out.println("continued");
    }
}
