public final class StageOne {
    private final StageTwo next = new StageTwo();
    private int caught;

    public int evaluate(Node node, int iteration) {
        try {
            return next.evaluate(node, iteration);
        } catch (IllegalStateException expected) {
            caught++;
            return -1;
        }
    }

    public int caught() {
        return caught;
    }
}
