public final class GraphMetrics {
    public int recursiveSum(Node node, int remaining) {
        if (remaining == 0) return 0;
        return node.id + recursiveSum(node.next, remaining - 1);
    }
}
