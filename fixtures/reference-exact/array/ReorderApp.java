import java.util.Arrays;

public class ReorderApp {
    public static void main(String[] args) {
        int[] values = {3, 8, 1, 6, 2};
        for (int end = values.length - 1; end > 0; end--) {
            for (int index = 0; index < end; index++) {
                int left = values[index];
                int right = values[index + 1];
                if (left > right) {
                    values[index] = right;
                    values[index + 1] = left;
                }
            }
        }
        System.out.println(Arrays.toString(values));
    }
}
