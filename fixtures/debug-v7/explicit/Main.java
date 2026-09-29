public class Main {
    public static void main(String[] args) {
        int value = -1;
        validate(value);
    }

    static void validate(int value) {
        if (value < 0) {
            throw new IllegalArgumentException("bad value");
        }
    }
}
