public class Main {
    public static void main(String[] args) {
        try {
            System.out.println("normal try");
        } finally {
            System.out.println("normal finally");
        }
        try {
            fail();
        } catch (ArithmeticException e) {
            System.out.println("recovered");
        }
        System.out.println("continued");
    }

    static void fail() {
        int denominator = 0;
        try {
            System.out.println("failing try");
            int result = 10 / denominator;
            System.out.println(result);
        } finally {
            System.out.println("exceptional finally");
        }
    }
}
