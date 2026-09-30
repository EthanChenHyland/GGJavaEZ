public final class StageTwo {
    private final StageThree next = new StageThree();

    public int evaluate(Node node, int iteration) {
        return next.evaluate(node, iteration);
    }
}
