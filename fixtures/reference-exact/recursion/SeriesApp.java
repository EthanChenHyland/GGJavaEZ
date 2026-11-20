public class SeriesApp {
    public static void main(String[] args) {
        int result = total(6);
        System.out.println("TOTAL " + result);
    }

    static int total(int count) {
        if (count == 0) return 0;
        int prior = total(count - 1);
        int result = count + prior;
        return result;
    }
}
