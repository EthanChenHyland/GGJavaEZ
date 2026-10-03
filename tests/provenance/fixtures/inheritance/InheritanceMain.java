public class InheritanceMain {
    static class Foundation {
        int inherited;
        Foundation(int baseline) { inherited = baseline; }
    }
    static class Extension extends Foundation {
        int own;
        Extension() { this(9); }
        Extension(int initial) {
            super(initial + 1);
            own = initial;
        }
        int total() { return inherited + own; }
    }
    public static void main(String[] args) {
        Extension first = new Extension();
        Extension second = new Extension(7);
        System.out.println(first.total() + second.total());
    }
}
