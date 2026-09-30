public final class Main {
    static final class LargeRecord {
        String label = "twelve observed fields";
        int a = 1, b = 2, c = 3, d = 4, e = 5, f = 6;
        int g = 7, h = 8, i = 9, j = 10, k = 11, l = 12;
        int total() { return a + b + c + d + e + f + g + h + i + j + k + l; }
    }
    static final class TinyRecord { }
    public static void main(String[] args) {
        LargeRecord large = new LargeRecord();
        TinyRecord tiny = new TinyRecord();
        int[] values = new int[12];
        for (int i = 0; i < values.length; i++) values[i] = i;
        System.out.println("FIELDS " + large.total() + " ARRAY " + values[11]);
    }
}
