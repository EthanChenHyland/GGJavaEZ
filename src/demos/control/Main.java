import java.util.Scanner;

public class Main {
    static int clamp(int value) {
        if (value < 0) {
            int corrected = 0;
            return corrected;
        } else if (value > 100) {
            int corrected = 100;
            return corrected;
        } else {
            int corrected = value;
            return corrected;
        }
    }

    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);
        int total = 0;
        for (int i = 0; i < 3; i++) {
            int raw = input.nextInt();
            int score = clamp(raw);
            total += score;
            System.out.println(score);
        }
        System.out.println(total);
    }
}
