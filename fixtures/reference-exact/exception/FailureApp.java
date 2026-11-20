public class FailureApp {
    public static void main(String[] args) {
        System.out.println("EXCEPTION READY");
        dispatch();
    }

    static void dispatch() {
        validate();
    }

    static void validate() {
        throw new IllegalStateException("failed shipment", new IllegalArgumentException("bad quantity"));
    }
}
